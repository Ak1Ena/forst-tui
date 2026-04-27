import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const listFilesTool = new DynamicTool({
    name: "list_files",
    description: "List files and directories at a filesystem path. Use when exploring project structure or checking what files exist in a directory.",
    func: async (input: string) => {
        try {
            const targetPath = input.trim() || process.cwd();
            const absolutePath = path.resolve(process.cwd(), targetPath);
            const entries = await fs.readdir(absolutePath, { withFileTypes: true });
            
            const list = entries.map(entry => {
                const type = entry.isDirectory() ? "[DIR]" : "[FILE]";
                return `${type} ${entry.name}`;
            });

            return list.length > 0 
                ? `Contents of ${targetPath}:\n${list.join("\n")}` 
                : `Directory ${targetPath} is empty.`;
        } catch (error: any) {
            return `Error listing files: ${error?.message || String(error)}`;
        }
    },
});
