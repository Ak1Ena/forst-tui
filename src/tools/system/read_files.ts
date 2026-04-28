import { z } from 'zod';
import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const readFilesTool = new DynamicStructuredTool({
    name: "read_files",
    description: "Reads the content of multiple files in a single turn. To save tokens and minimize turns, ALWAYS group multiple files into a single call instead of calling this tool repeatedly. Supports line ranges per file.",
    schema: z.object({
        files: z.array(z.object({
            filePath: z.string().describe("Relative path to the file"),
            startLine: z.number().int().min(1).optional().describe("Start line (1-based)"),
            endLine: z.number().int().min(1).optional().describe("End line (1-based, inclusive)")
        })).describe("List of files to read in bulk"),
    }),
    func: async ({ files }) => {
        const results = [];
        const MAX_TOTAL_CHARS = 30000; // Total response limit
        let currentTotalChars = 0;

        for (const fileReq of files) {
            if (currentTotalChars >= MAX_TOTAL_CHARS) {
                results.push(`--- ${fileReq.filePath} ---\n[SKIPPED: Total output limit reached]`);
                continue;
            }

            try {
                const absolutePath = path.resolve(process.cwd(), fileReq.filePath);
                
                // Security check
                if (!absolutePath.startsWith(process.cwd())) {
                    results.push(`--- ${fileReq.filePath} ---\nError: Cannot read path outside project directory`);
                    continue;
                }

                const content = await fs.readFile(absolutePath, "utf-8");
                const lines = content.split('\n');
                
                let start = (fileReq.startLine || 1) - 1;
                let end = fileReq.endLine || lines.length;
                
                // Clamp values
                start = Math.max(0, Math.min(start, lines.length));
                end = Math.max(start, Math.min(end, lines.length));

                let selectedLines = lines.slice(start, end);
                let resultText = selectedLines.join('\n');

                const MAX_FILE_CHARS = 15000; // Limit per file if not specific
                if (!fileReq.startLine && !fileReq.endLine && resultText.length > MAX_FILE_CHARS) {
                    resultText = resultText.substring(0, MAX_FILE_CHARS) + `\n\n[WARNING: File too large, truncated at ${MAX_FILE_CHARS} chars. Use startLine/endLine for specific parts.]`;
                }

                const header = `--- ${fileReq.filePath} (Lines ${start + 1}-${end}) ---\n`;
                const finalEntry = header + resultText;

                if (currentTotalChars + finalEntry.length > MAX_TOTAL_CHARS) {
                    const remaining = MAX_TOTAL_CHARS - currentTotalChars - header.length - 50;
                    if (remaining > 100) {
                        results.push(header + resultText.substring(0, remaining) + "\n\n[TRUNCATED: Total output limit reached]");
                    } else {
                        results.push(`--- ${fileReq.filePath} ---\n[TRUNCATED: Total output limit reached]`);
                    }
                    currentTotalChars = MAX_TOTAL_CHARS;
                } else {
                    results.push(finalEntry);
                    currentTotalChars += finalEntry.length;
                }
            } catch (error: any) {
                results.push(`--- ${fileReq.filePath} ---\nError: ${error?.message || String(error)}`);
            }
        }

        return results.join("\n\n");
    },
});
