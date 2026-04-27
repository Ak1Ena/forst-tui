import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { DynamicStructuredTool } from "@langchain/core/tools";

export const editFileTool = new DynamicStructuredTool({
    name: 'edit_file',
    description: [
        'Make surgical line-level edits to a file, or create a new one.',
        'Operations:',
        '  "insert"  — insert new_lines after `line` (use line 0 to prepend).',
        '  "replace" — replace lines from `line` to `end_line` (inclusive) with new_lines.',
        '  "delete"  — delete lines from `line` to `end_line` (inclusive).',
        '  "create"  — create a new file with new_lines as content (fails if file exists).',
        'Always read_files first to get current line numbers before editing.',
        'Prefer replace/delete/insert over rewriting the whole file.',
    ].join(' '),
    schema: z.object({
        filePath: z.string().describe('Relative or absolute path to the file.'),
        operation: z.enum(['insert', 'replace', 'delete', 'create']).describe(
            'insert=add lines after `line`, replace=swap line..end_line, delete=remove line..end_line, create=new file.'
        ),
        line: z.number().int().min(0).optional().describe(
            'Target line number (1-based). For insert: lines are added AFTER this line (0 = prepend). Required for insert/replace/delete.'
        ),
        end_line: z.number().int().min(1).optional().describe(
            'Last line of the range for replace/delete (inclusive, 1-based). Defaults to `line` if omitted.'
        ),
        new_lines: z.string().optional().describe(
            'Content to insert or use as replacement. Not used for delete. Trailing newline is added automatically if missing.'
        ),
    }),
    func: async ({ filePath, operation, line, end_line, new_lines }) => {
        try {
            const absolutePath = path.resolve(process.cwd(), filePath);

            // Security check
            if (!absolutePath.startsWith(process.cwd())) {
                return `Error: Cannot edit path outside project directory: ${filePath}`;
            }

            // ── CREATE ─────────────────────────────────────────────────────────
            if (operation === 'create') {
                if (fs.existsSync(absolutePath)) {
                    return `Error: File already exists: ${filePath}. Use replace/insert to modify it.`;
                }
                const dir = path.dirname(absolutePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const content = new_lines ?? '';
                fs.writeFileSync(absolutePath, content.endsWith('\n') ? content : content + '\n', 'utf8');
                const lineCount = content.split('\n').length;
                return `Created ${filePath} (${lineCount} lines).`;
            }

            // All other operations require the file to exist
            if (!fs.existsSync(absolutePath)) {
                return `Error: File not found: ${filePath}. Use operation "create" to create it.`;
            }

            const raw = fs.readFileSync(absolutePath, 'utf8');
            // Preserve trailing newline state; work on lines without the final empty split artefact
            const trailingNewline = raw.endsWith('\n');
            const lines = raw.endsWith('\n') ? raw.slice(0, -1).split('\n') : raw.split('\n');
            const total = lines.length;

            if (line === undefined) return `Error: "line" is required for operation "${operation}".`;

            const from = line;           // 1-based start (0 = before line 1 for insert)
            const to   = end_line ?? from; // 1-based end, inclusive

            // Validate range
            if (operation !== 'insert' && (from < 1 || to < from || from > total || to > total)) {
                return `Error: Line range ${from}-${to} is out of bounds (file has ${total} lines).`;
            }
            if (operation === 'insert' && from > total) {
                return `Error: Insert after line ${from} but file only has ${total} lines.`;
            }

            const newContent = new_lines
                ? (new_lines.endsWith('\n') ? new_lines.slice(0, -1).split('\n') : new_lines.split('\n'))
                : [];

            let result: string[];

            // ── INSERT ─────────────────────────────────────────────────────────
            if (operation === 'insert') {
                result = [
                    ...lines.slice(0, from),
                    ...newContent,
                    ...lines.slice(from),
                ];
            }
            // ── REPLACE ────────────────────────────────────────────────────────
            else if (operation === 'replace') {
                result = [
                    ...lines.slice(0, from - 1),
                    ...newContent,
                    ...lines.slice(to),
                ];
            }
            // ── DELETE ─────────────────────────────────────────────────────────
            else if (operation === 'delete') {
                result = [
                    ...lines.slice(0, from - 1),
                    ...lines.slice(to),
                ];
            } else {
                return `Error: Unknown operation "${operation}".`;
            }

            const output = result.join('\n') + (trailingNewline ? '\n' : '');
            fs.writeFileSync(absolutePath, output, 'utf8');

            // Build a context window around the edit for confirmation
            const changedStart = Math.max(0, from - 1);
            let changedEnd: number;

            if (operation === 'insert') {
                changedEnd = changedStart + newContent.length;
            } else if (operation === 'replace') {
                changedEnd = changedStart + newContent.length;
            } else { // delete
                changedEnd = changedStart; // Show lines around the deletion point
            }
            
            const previewStart = Math.max(0, changedStart - 2);
            const previewEnd   = Math.min(result.length, Math.max(changedEnd + 3, previewStart + 1));

            const opDesc =
                operation === 'insert'  ? `inserted ${newContent.length} line(s) after line ${from}` :
                operation === 'replace' ? `replaced lines ${from}-${to} with ${newContent.length} line(s)` :
                                          `deleted lines ${from}-${to}`;

            // Build a boxed context window
            const previewLines = result.slice(previewStart, previewEnd);
            const maxLineNumWidth = String(previewEnd).length;
            const contentWidths = previewLines.map(l => l.length + maxLineNumWidth + 5);
            const maxWidth = Math.min(100, Math.max(40, ...contentWidths));
            
            const boxTop    = `┌${'─'.repeat(maxWidth + 2)}┐`;
            const boxBottom = `└${'─'.repeat(maxWidth + 2)}┘`;
            
            const formattedPreview = previewLines.map((l, i) => {
                const curLine = previewStart + i + 1;
                let marker = ' ';
                if (operation === 'insert' && curLine > from && curLine <= from + newContent.length) {
                    marker = '+';
                } else if (operation === 'replace' && curLine >= from && curLine < from + newContent.length) {
                    marker = '+';
                } else if (operation === 'delete' && curLine === from) {
                    marker = '-';
                }

                const lineNumStr = String(curLine).padStart(maxLineNumWidth, ' ');
                const content = `${marker} ${lineNumStr} │ ${l}`;
                // Use a helper to pad or truncate correctly
                const paddedContent = content.length > maxWidth 
                    ? content.slice(0, maxWidth - 3) + '...' 
                    : content.padEnd(maxWidth);
                return `│ ${paddedContent} │`;
            }).join('\n');

            return [
                `${filePath}: ${opDesc}`,
                `File now has ${result.length} lines.`,
                '',
                'Changes:',
                boxTop,
                formattedPreview,
                boxBottom
            ].join('\n');
        } catch (error: any) {
            return `Error: ${error?.message ?? String(error)}`;
        }
    },
});
