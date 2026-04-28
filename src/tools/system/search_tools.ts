import { z } from 'zod';
import { DynamicStructuredTool } from "@langchain/core/tools";
import { toolRetriever } from "../../core/ToolRetriever.js";

export const searchToolsTool = new DynamicStructuredTool({
    name: 'search_tools',
    description: 'Search for available tools and their descriptions. Use this only when you are unsure which tool to use for a specific new task.',
    schema: z.object({
        query: z.string().describe('The keyword or description of the task you want to perform.'),
    }),
    func: async ({ query }) => {
        try {
            const results = toolRetriever.search(query, 5);
            if (results.length === 0) {
                return `No specific tools found for "${query}".\n\nFull Tool Catalog:\n${toolRetriever.getCatalog()}`;
            }

            const toolInfo = results.map(r => `- ${r.name}: ${r.description}`).join('\n');
            return `Search results for "${query}":\n${toolInfo}\n\nNote: If a tool you need is not in this list, check the catalog below:\n${toolRetriever.getCatalog()}`;
        } catch (error: any) {
            return `Error searching tools: ${error?.message || String(error)}`;
        }
    }
});
