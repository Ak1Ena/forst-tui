import { z } from 'zod';
import { DynamicStructuredTool } from "@langchain/core/tools";
import { addCoreMemory, deleteCoreMemory, getCoreMemories } from '../../database/coreMemory.js';

export const memoryTool = new DynamicStructuredTool({
    name: 'core_memory',
    description: 'Manage core memories. Use this to remember facts about yourself (ai), the user (user), or the world (world) permanently across all sessions. You can also list or delete memories.',
    schema: z.object({
        action: z.enum(['add', 'delete', 'list']).describe('The action to perform.'),
        category: z.enum(['ai', 'user', 'world']).optional().describe('Required for "add". The category of the memory.'),
        content: z.string().optional().describe('Required for "add". The fact to remember (be concise).'),
        id: z.number().optional().describe('Required for "delete". The ID of the memory to remove.')
    }),
    func: async ({ action, category, content, id }) => {
        try {
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
