import { z } from 'zod';
import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from 'fs';
import path from 'path';
import { SKILLS_DIR } from '../../core/ConfigManager.js';

export const skillsTool = new DynamicStructuredTool({
    name: 'manage_skills',
    description: 'Add, delete, or retrieve persistent AI skill instructions stored as Markdown. Use only when the user explicitly asks to save, install, remove, or look up a named skill or specialized knowledge module.',
    schema: z.object({
        action: z.enum(['list', 'read', 'add', 'delete']).describe('The action to perform.'),
        skillName: z.string().optional().describe('The name of the skill (e.g., "react-expert").'),
        content: z.string().optional().describe('The detailed instructions or knowledge for the skill (Markdown format). Required for "add".'),
    }),
    func: async ({ action, skillName, content }) => {
        try {
            if (action === 'list') {
                if (!fs.existsSync(SKILLS_DIR)) return 'No skills folder found.';
                const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));
                if (files.length === 0) return 'No skills installed yet.';
                return `Installed skills:\n${files.map(f => `- ${f.replace('.md', '')}`).join('\n')}`;
            }

            if (action === 'read') {
                if (!skillName) return 'Error: skillName is required for "read".';
                const filePath = path.join(SKILLS_DIR, `${skillName}.md`);
                if (!fs.existsSync(filePath)) return `Skill "${skillName}" not found.`;
                return fs.readFileSync(filePath, 'utf-8');
            }

            if (action === 'add') {
                if (!skillName || !content) return 'Error: skillName and content are required for "add".';
                const filePath = path.join(SKILLS_DIR, `${skillName}.md`);
                fs.writeFileSync(filePath, content, 'utf-8');
                return `Successfully added skill: ${skillName}. I will now use these instructions in future responses.`;
            }

            if (action === 'delete') {
                if (!skillName) return 'Error: skillName is required for "delete".';
                const filePath = path.join(SKILLS_DIR, `${skillName}.md`);
                if (!fs.existsSync(filePath)) return `Skill "${skillName}" not found.`;
                fs.unlinkSync(filePath);
                return `Successfully deleted skill: ${skillName}`;
            }

            return `Unknown action: ${action}`;
        } catch (error: any) {
            return `Skill management error: ${error?.message || String(error)}`;
        }
    }
});
