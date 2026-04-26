import { DynamicTool } from "@langchain/core/tools";
import fs from "fs/promises";
import path from "path";

export const readFilesTool = new DynamicTool({
    name: "read_files",
    description: "Reads the content of one or more files on the local disk. Use this to read source code, documentation, or any project files. Input should be a relative or absolute file path.",
    func: async (input: string) => {
        const paths = input.split(",").map(p => p.trim());
        const results = [];

        for (const filePath of paths) {
            try {
                const absolutePath = path.resolve(process.cwd(), filePath);
                const content = await fs.readFile(absolutePath, "utf-8");
                results.push(`--- ${filePath} ---\n${content}`);
            } catch (error: any) {
                results.push(`--- ${filePath} ---\nError: ${error.message}`);
            }
        }

        return results.join("\n\n");
    },
});
