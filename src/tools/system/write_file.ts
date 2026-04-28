import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { DynamicStructuredTool } from "@langchain/core/tools";

const PREVIEW_LINES = 8;

/** Format write output in the same compact numbered style as read_files. */
function formatWritePreview(filePath: string, lines: string[]): string {
    const n = lines.length;
    const header = `--- ${filePath} (${n} lines written) ---`;
    const pad = String(n).length;
    const preview = lines.slice(0, PREVIEW_LINES).map((l, i) => {
        const lineNum = String(i + 1).padStart(pad, ' ');
        return `${lineNum} │ ${l}`;
    });
    const tail = n > PREVIEW_LINES ? [`  … (${n - PREVIEW_LINES} more lines)`] : [];
    return [header, ...preview, ...tail].join('\n');
}

export const writeFileTool = new DynamicStructuredTool({
    name: 'write_file',
    description: [
        'Write (overwrite) a file with new content.',
        'Prefer edit_file for surgical line-level changes.',
        'Use write_file when creating a new file or rewriting the entire content.',
        'Returns a numbered preview of the written content.',
    ].join(' '),
    schema: z.object({
        filePath: z.string().describe('Relative or absolute path to the file to write.'),
        content: z.string().describe('Full content to write to the file.'),
    }),
    func: async ({ filePath, content }: { filePath: string; content: string }) => {
        try {
            const absolutePath = path.resolve(process.cwd(), filePath);

            // Security check — resolve symlinks before comparing to project root.
            const projectRoot = fs.realpathSync(process.cwd());
            let realAbsolute: string;
            try {
                realAbsolute = fs.realpathSync(absolutePath);
            } catch {
                // File doesn't exist yet — resolve parent dir instead.
                realAbsolute = path.resolve(
                    fs.realpathSync(path.dirname(absolutePath)),
                    path.basename(absolutePath)
                );
            }
            if (!realAbsolute.startsWith(projectRoot + path.sep) && realAbsolute !== projectRoot) {
                return `Error: Cannot write to path outside project directory: ${filePath}`;
            }

            // Ensure parent directory exists
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(absolutePath, content, 'utf8');

            const lines = content.split('\n');
            return formatWritePreview(filePath, lines);
        } catch (error: any) {
            return `--- ${filePath} ---\nError: ${error?.message || String(error)}`;
        }
    },
});
