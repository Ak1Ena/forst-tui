import { z } from 'zod';
import { DynamicStructuredTool } from "@langchain/core/tools";
import { addCoreMemory, deleteCoreMemory, getCoreMemories } from '../../database/coreMemory.js';
import { vectorMemory } from '../../database/vectorStore.js';

export const memoryTool = new DynamicStructuredTool({
    name: 'core_memory',
    description: 'Manage memories. Actions: "add"/"delete"/"list" for core facts, and "search" to query the semantic history of all past conversations.',
    schema: z.object({
        action: z.enum(['add', 'delete', 'list', 'search']).describe('The action to perform.'),
        category: z.enum(['ai', 'user', 'world']).optional().describe('Required for "add".'),
        content: z.string().optional().describe('Required for "add" (the fact) or "search" (the query).'),
        id: z.number().optional().describe('Required for "delete".')
    }),
    func: async ({ action, category, content, id }) => {
        try {
            if (action === 'search') {
                if (!content) return 'Error: content (query) is required for search.';
                const results = await vectorMemory.getRelevantContext(content, 10);
                return results || 'No relevant memories found for that query.';
            }

            if (action === 'list') {
                const memories = getCoreMemories();
                if (memories.length === 0) return 'No core memories stored.';
                return memories.map(m => `[${m.id}] (${m.category.toUpperCase()}) ${m.content}`).join('\n');
            }
            
            if (action === 'add') {
                if (!category || !content) return 'Error: category and content are required to add a memory.';
                return addCoreMemory(category, content);
            }
            
            if (action === 'delete') {
                if (id === undefined) return 'Error: id is required to delete a memory.';
                return deleteCoreMemory(id);
            }
            
            return `Unknown action: ${action}`;
        } catch (error: any) {
            return `Memory error: ${error?.message || String(error)}`;
        }
    }
});
