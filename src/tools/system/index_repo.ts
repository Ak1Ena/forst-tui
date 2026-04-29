import { z } from 'zod';
import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";
import * as fsSync from 'fs';
import path from "path";
import crypto from "crypto";

const FORST_DIR = ".forst";
const SUMMARIES_DIR = path.join(FORST_DIR, "summaries");

async function ensureDirs() {
    if (!fsSync.existsSync(FORST_DIR)) await fs.mkdir(FORST_DIR);
    if (!fsSync.existsSync(SUMMARIES_DIR)) await fs.mkdir(SUMMARIES_DIR);
}

function getFileHash(content: string): string {
    return crypto.createHash('sha1').update(content).digest('hex').substring(0, 8);
}

export const indexRepoTool = new DynamicStructuredTool({
    name: "index_repo",
    description: "Indexes the repository by generating folder-level summaries. This saves tokens in future turns. Call this once at the start of a project or when structure changes significantly.",
    schema: z.object({
        folder: z.string().optional().describe("Specific folder to (re-)index. If omitted, indexes the entire project."),
    }),
    func: async ({ folder }) => {
        try {
            await ensureDirs();
            const root = process.cwd();
            const targetDir = folder ? path.resolve(root, folder) : root;

            if (!targetDir.startsWith(root)) {
                return "Error: Cannot index outside project directory.";
            }

            const foldersToProcess: string[] = [];
            
            async function walk(dir: string) {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                let hasFiles = false;
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walk(fullPath);
                    } else {
                        hasFiles = true;
                    }
                }
                if (hasFiles) foldersToProcess.push(dir);
            }

            if (folder) {
                foldersToProcess.push(targetDir);
            } else {
                await walk(root);
            }

            const summaries = [];
            for (const dir of foldersToProcess) {
                const relDir = path.relative(root, dir) || ".";
                const summaryFile = path.join(SUMMARIES_DIR, `${relDir.replace(/\//g, '_')}.md`);
                
                const entries = await fs.readdir(dir, { withFileTypes: true });
                const files = [];
                let contentToHash = "";
                
                for (const entry of entries) {
                    if (entry.isFile() && !entry.name.startsWith('.')) {
                        const content = await fs.readFile(path.join(dir, entry.name), 'utf8');
                        files.push({ name: entry.name, size: content.length });
                        contentToHash += entry.name + content;
                    }
                }

                if (files.length === 0) continue;

                const hash = getFileHash(contentToHash);
                const date = new Date().toISOString().split('T')[0];
                
                let summaryContent = `<!-- hash: ${hash} | updated: ${date} | files: ${files.map(f => f.name).join(',')} -->\n`;
                summaryContent += `# ${relDir}/\n\n`;
                summaryContent += `This folder contains ${files.length} files:\n`;
                for (const file of files) {
                    summaryContent += `- ${file.name} (${(file.size / 1024).toFixed(1)} KB)\n`;
                }
                
                // Add a placeholder for actual summary if we had an LLM call here, 
                // but for now we just list files and sizes as a "cheap" summary.
                // A better version would use the agent to summarize each file.
                
                await fs.writeFile(summaryFile, summaryContent, 'utf8');
                summaries.push(relDir);
            }

            // Update repo-index.md
            const indexFile = path.join(FORST_DIR, "repo-index.md");
            let indexContent = `# Project Index\n\n`;
            indexContent += `Updated: ${new Date().toISOString()}\n\n`;
            indexContent += `## Folders\n`;
            for (const s of summaries.sort()) {
                indexContent += `- [${s}/](summaries/${s.replace(/\//g, '_')}.md)\n`;
            }

            await fs.writeFile(indexFile, indexContent, 'utf8');

            return `Successfully indexed ${summaries.length} folders. Index saved to .forst/repo-index.md`;
        } catch (error: any) {
            return `Error indexing repo: ${error?.message || String(error)}`;
        }
    },
});
