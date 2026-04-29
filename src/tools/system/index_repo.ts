import { z } from 'zod';
import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs/promises";
import * as fsSync from 'fs';
import path from "path";
import crypto from "crypto";
import { GLOBAL_DIR } from "../../core/ConfigManager.js";

function getProjectSlug(): string {
    const root = process.cwd();
    // Create a unique slug based on the project path to avoid collisions
    return crypto.createHash('sha1').update(root).digest('hex').substring(0, 10);
}

function getProjectName(): string {
    return path.basename(process.cwd());
}

function getProjectPath(): string {
    const projectName = getProjectName();
    const projectSlug = getProjectSlug();
    return path.join(GLOBAL_DIR, 'folder', `${projectName}_${projectSlug}`);
}

function getSummarizePath(): string {
    return path.join(getProjectPath(), 'summerize');
}

function getRepoIndexPath(): string {
    return path.join(getProjectPath(), 'repo_index.md');
}

async function ensureDirs() {
    const paths = [
        path.join(GLOBAL_DIR, 'folder'),
        getProjectPath(),
        getSummarizePath()
    ];
    for (const p of paths) {
        if (!fsSync.existsSync(p)) await fs.mkdir(p, { recursive: true });
    }
}

function getFileHash(content: string): string {
    return crypto.createHash('sha1').update(content).digest('hex').substring(0, 8);
}

export const indexRepoTool = new DynamicStructuredTool({
    name: "index_repo",
    description: "Indexes the repository by generating folder-level summaries. Use this to save high-level descriptions of folder purposes to save tokens in future turns. ALWAYS provide a 'summary' if you've just researched a new folder.",
    schema: z.object({
        folder: z.string().optional().describe("Specific folder to (re-)index. If omitted, indexes the entire project."),
        summary: z.string().optional().describe("A natural language description of what this folder does and its key files. If provided, it will be saved into the folder's summary file.")
    }),
    func: async ({ folder, summary }) => {
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
            const summarizeDir = getSummarizePath();

            for (const dir of foldersToProcess) {
                const relDir = path.relative(root, dir) || ".";
                const summaryFile = path.join(summarizeDir, `${relDir.replace(/\//g, '_')}.md`);
                
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

                if (summary && foldersToProcess.length === 1) {
                    // If we're indexing a specific folder with a provided summary
                    summaryContent += `## 💡 Purpose\n${summary}\n\n`;
                } else if (fsSync.existsSync(summaryFile)) {
                    // Try to preserve existing custom summary if only metadata is being updated
                    const existing = await fs.readFile(summaryFile, 'utf8');
                    const purposeMatch = existing.match(/## 💡 Purpose\n([\s\S]*?)\n\n##/);
                    if (purposeMatch) {
                        summaryContent += `## 💡 Purpose\n${purposeMatch[1]}\n\n`;
                    }
                }

                summaryContent += `## 🔑 Files\n`;
                for (const file of files) {
                    summaryContent += `- ${file.name} (${(file.size / 1024).toFixed(1)} KB)\n`;
                }
                
                await fs.writeFile(summaryFile, summaryContent, 'utf8');
                summaries.push(relDir);
            }

            // Update repo_index.md
            const indexFile = getRepoIndexPath();
            let indexContent = `# Project Index: ${getProjectName()}\n\n`;
            indexContent += `Updated: ${new Date().toISOString()}\n\n`;
            indexContent += `## Folders\n`;
            for (const s of summaries.sort()) {
                indexContent += `- [${s}/](summerize/${s.replace(/\//g, '_')}.md)\n`;
            }

            await fs.writeFile(indexFile, indexContent, 'utf8');

            return `Successfully indexed ${summaries.length} folders. Index saved to ${indexFile}`;
        } catch (error: any) {
            return `Error indexing repo: ${error?.message || String(error)}`;
        }
    },
});
