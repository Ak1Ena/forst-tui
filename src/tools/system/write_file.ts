import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { DynamicStructuredTool } from "@langchain/core/tools";

export const writeFileTool = new DynamicStructuredTool({
    name: 'write_file',
    description: 'Write content to a file. Use this to create or update code files.',
    schema: z.object({
        filePath: z.string().describe('The path to the file to write'),
        content: z.string().describe('The content to write to the file'),
    }),
    func: async ({ filePath, content }: { filePath: string; content: string }) => {
        try {
            const absolutePath = path.resolve(process.cwd(), filePath);
            
            // Basic security check - don't write outside project dir
            if (!absolutePath.startsWith(process.cwd())) {
                return `Error: Cannot write to path outside of project directory: ${filePath}`;
            }

            // Ensure directory exists
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(absolutePath, content, 'utf8');
            
            // Return a summary and a preview of the file
            const lineCount = content.split('\n').length;
            return `Successfully wrote ${lineCount} lines to ${filePath}.\n\nPreview:\n\`\`\`\n${content.slice(0, 500)}${content.length > 500 ? '...' : ''}\n\`\`\``;
        } catch (error: any) {
            return `Error writing file: ${error?.message || String(error)}`;
        }
    }
});
