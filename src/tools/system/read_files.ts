import { z } from 'zod';
import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";
import * as fsSync from "fs";
import path from "path";

const SUMMARIES_DIR = path.join(".forst", "summaries");

/** Consistent formatting for line-numbered source code */
function formatLines(lines: string[], startLine: number): string {
    const pad = String(startLine + lines.length).length;
    return lines.map((line, i) => {
        const lineNum = String(startLine + i).padStart(pad, ' ');
        return `${lineNum} │ ${line}`;
    }).join('\n');
}

export const readFilesTool = new DynamicStructuredTool({
    name: "read_files",
    description: "Reads the content of multiple files in a single turn. To save tokens and minimize turns, ALWAYS group multiple files into a single call instead of calling this tool repeatedly. Supports line ranges per file.",
    schema: z.object({
        files: z.array(z.object({
            filePath: z.string().describe("Relative path to the file"),
            startLine: z.number().int().min(1).optional().describe("Start line (1-based)"),
            endLine: z.number().int().min(1).optional().describe("End line (1-based, inclusive)"),
            force: z.boolean().optional().describe("Force read raw content even if a summary exists.")
        })).describe("List of files to read in bulk"),
    }),
    func: async ({ files }, _runManager, config: any) => {
        const results = [];
        const MAX_TOTAL_CHARS = 30000; // Total response limit
        let currentTotalChars = 0;
        const cache = config?.configurable?.toolResultCache;

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

                // Fix R5: Post-edit intercept
                if (!fileReq.force && cache && cache.has(`post-edit:${fileReq.filePath}`)) {
                    const editResult = cache.get(`post-edit:${fileReq.filePath}`);
                    results.push(`--- ${fileReq.filePath} (Recently Edited) ---\n[RECENTLY EDITED] Returning last edit confirmation instead of full file. Use force:true to read full file.\n\n${editResult}`);
                    continue;
                }

                // Smart Guard: Suggest summary if available
                if (!fileReq.force && !fileReq.startLine && !fileReq.endLine) {
                    const relDir = path.dirname(fileReq.filePath);
                    const summaryFile = path.join(SUMMARIES_DIR, `${relDir.replace(/\//g, '_')}.md`);
                    if (fsSync.existsSync(summaryFile)) {
                        const summary = await fs.readFile(summaryFile, 'utf8');
                        results.push(`--- ${fileReq.filePath} (Suggested Summary) ---\n[FOLDER SUMMARY AVAILABLE] Returning ${relDir}/ summary instead of full file. Use force:true to read raw content.\n\n${summary}`);
                        continue;
                    }
                }

                const content = await fs.readFile(absolutePath, "utf-8");
                const lines = content.split('\n');
                
                let start = (fileReq.startLine || 1) - 1;
                let end = fileReq.endLine || lines.length;
                
                // Clamp values
                start = Math.max(0, Math.min(start, lines.length));
                end = Math.max(start, Math.min(end, lines.length));

                let selectedLines = lines.slice(start, end);
                
                // Limit per file if not specific
                const MAX_FILE_CHARS = 15000;
                let isTruncatedByFileLimit = false;
                if (!fileReq.startLine && !fileReq.endLine && selectedLines.join('\n').length > MAX_FILE_CHARS) {
                    let chars = 0;
                    const truncatedLines = [];
                    for (const line of selectedLines) {
                        if (chars + line.length > MAX_FILE_CHARS) {
                            isTruncatedByFileLimit = true;
                            break;
                        }
                        truncatedLines.push(line);
                        chars += line.length + 1;
                    }
                    selectedLines = truncatedLines;
                }

                let resultText = formatLines(selectedLines, start + 1);
                if (isTruncatedByFileLimit) {
                    resultText += `\n\n[WARNING: File too large, truncated at ${MAX_FILE_CHARS} chars. Use startLine/endLine for specific parts.]`;
                }

                const header = `--- ${fileReq.filePath} (Lines ${start + 1}-${start + selectedLines.length}) ---\n`;
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
