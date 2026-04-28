import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const readFilesTool = new DynamicTool({
    name: "read_files",
    description: "Reads the content of one or more files. Use for source code or docs. Note: Files over 10KB are truncated. For large files, use specific tools or commands to read parts.",
    func: async (input: string) => {
        const paths = input.split(",").map(p => p.trim());
        const results = [];

        for (const filePath of paths) {
            try {
                const absolutePath = path.resolve(process.cwd(), filePath);
                const stats = await fs.stat(absolutePath);
                const MAX_SIZE = 10 * 1024; // 10KB limit
                
                if (stats.size > MAX_SIZE) {
                    const handle = await fs.open(absolutePath, 'r');
                    const buffer = Buffer.alloc(MAX_SIZE);
                    await handle.read(buffer, 0, MAX_SIZE, 0);
                    await handle.close();
                    results.push(`--- ${filePath} ---\n[WARNING: File too large, showing first 10KB]\n${buffer.toString('utf-8')}`);
                } else {
                    const content = await fs.readFile(absolutePath, "utf-8");
                    results.push(`--- ${filePath} ---\n${content}`);
                }
            } catch (error: any) {
                results.push(`--- ${filePath} ---\nError: ${error?.message || String(error)}`);
            }
        }

        return results.join("\n\n");
    },
});
