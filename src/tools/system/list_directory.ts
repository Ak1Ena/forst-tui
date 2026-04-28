import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { DynamicStructuredTool } from "@langchain/core/tools";

const PREVIEW_LINES = 8;

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

export const listDirectoryTool = new DynamicStructuredTool({
    name: 'list_directory',
    description: [
        'List the contents of a directory.',
        'Prefer this over shelling out to `ls` — it is faster, safe, and returns structured output.',
        'Set recursive=true to walk subdirectories.',
        'Returns a numbered, line-by-line preview capped at first 8 entries (then a "N more" hint).',
    ].join(' '),
    schema: z.object({
        dirPath: z.string().describe('Relative or absolute path to the directory to list.'),
        recursive: z.boolean().optional().default(false).describe('Walk subdirectories recursively (default false).'),
    }),
    func: async ({ dirPath, recursive }) => {
        try {
            const absolutePath = path.resolve(process.cwd(), dirPath);

            // Security check — resolve symlinks before comparing.
            const projectRoot = fs.realpathSync(process.cwd());
            let realAbsolute: string;
            try {
                realAbsolute = fs.realpathSync(absolutePath);
            } catch {
                return `--- ${dirPath} ---\nError: Directory not found: ${dirPath}`;
            }
            if (!realAbsolute.startsWith(projectRoot + path.sep) && realAbsolute !== projectRoot) {
                return `--- ${dirPath} ---\nError: Cannot list path outside project directory: ${dirPath}`;
            }

            if (!fs.existsSync(absolutePath)) {
                return `--- ${dirPath} ---\nError: Directory not found: ${dirPath}`;
            }

            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return `--- ${dirPath} ---\nError: Not a directory: ${dirPath}`;
            }

            // Collect entries
            const entries: { label: string }[] = [];
            function collect(dir: string, prefix: string = '') {
                const items = fs.readdirSync(dir).sort();
                for (const item of items) {
                    // Skip hidden files and common noise dirs
                    if (item.startsWith('.') || item === 'node_modules') continue;
                    const fullPath = path.join(dir, item);
                    try {
                        const s = fs.statSync(fullPath);
                        const relPath = prefix ? `${prefix}/${item}` : item;
                        if (s.isDirectory()) {
                            entries.push({ label: `[DIR]  ${relPath}/` });
                            if (recursive) collect(fullPath, relPath);
                        } else {
                            entries.push({ label: `[FILE] ${relPath.padEnd(36)} ${formatSize(s.size)}` });
                        }
                    } catch {
                        // Skip unreadable entries
                    }
                }
            }

            collect(absolutePath);

            if (entries.length === 0) {
                return `--- ${dirPath} (0 entries) ---\n(empty)`;
            }

            const n = entries.length;
            const pad = String(n).length;
            const header = `--- ${dirPath} (${n} entries) ---`;
            const preview = entries.slice(0, PREVIEW_LINES).map((e, i) => {
                const lineNum = String(i + 1).padStart(pad, ' ');
                return `${lineNum} │ ${e.label}`;
            });
            const tail = n > PREVIEW_LINES ? [`  … (${n - PREVIEW_LINES} more entries)`] : [];

            return [header, ...preview, ...tail].join('\n');
        } catch (error: any) {
            return `--- ${dirPath} ---\nError: ${error?.message || String(error)}`;
        }
    },
});
