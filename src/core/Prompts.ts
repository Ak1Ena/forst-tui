import { getCoreMemories } from "../database/coreMemory.js";
import { SkillManager } from "./SkillManager.js";

const BASE_PROMPT = `You are Forst-TUI, a powerful Terminal-based AI Assistant. 

CAPABILITIES:
1. File System: You HAVE tools to list files (list_files), read files (read_files), and write files (write_file) on the user's local machine. 
2. Execution: You can execute shell commands (run_command).
3. Web: You can search the internet (duckduckgo-search).
4. Memory: You have a "Soul". Use 'core_memory' to remember facts about yourself (ai), the user (user), or the world (world) permanently.
5. Skills: You can learn and use specialized skills stored in your skills folder.

INSTRUCTIONS:
- When a user asks about files in their directory, DO NOT say you cannot access them. Use "list_files" or "read_files" immediately.
- If you need to create or modify code, use the "write_file" tool.
- If you learn an important fact about yourself or the user, use "core_memory" to save it for future sessions.
- If you need to perform a task that requires a specific skill you have, refer to the SKILLS section.
- If you need to know the project structure to answer a question, use "list_files".
- You are running locally on the user's computer via a Node.js TUI wrapper.
- Be concise, professional, and proactive in using your tools.
`;

export const getSystemPrompt = (plannerMode: boolean = false) => {
    try {
        const memories = getCoreMemories();
        const skillsPrompt = SkillManager.getSkillsPrompt();
        
        let finalPrompt = BASE_PROMPT;

        if (plannerMode) {
            finalPrompt += `
\n--- PLANNER MODE ACTIVE ---
You are in Coworker Planner Mode. 
1. When the user gives a complex instruction, your FIRST response must be a plan.
2. Format the plan exactly like this: PLAN: [{"id": "t1", "description": "Step 1..."}, {"id": "t2", "description": "Step 2..."}]
3. After the plan is accepted, focus on one task at a time.
4. When you finish a task, include "COMPLETED: <task_id>" in your response.
5. If the user manually adds a task (you will see it in the [TASK QUEUE]), adjust your actions to include it.
`;
        }

        if (memories.length > 0) {
            const aiMemories = memories.filter(m => m.category === 'ai').map(m => `- ${m.content}`).join('\n');
            const userMemories = memories.filter(m => m.category === 'user').map(m => `- ${m.content}`).join('\n');
            const worldMemories = memories.filter(m => m.category === 'world').map(m => `- ${m.content}`).join('\n');

            let memorySection = '\n\n--- CORE MEMORIES (YOUR SOUL) ---\n';
            if (aiMemories) memorySection += `\nABOUT YOU (AI):\n${aiMemories}\n`;
            if (userMemories) memorySection += `\nABOUT THE USER:\n${userMemories}\n`;
            if (worldMemories) memorySection += `\nABOUT THE WORLD/PROJECT:\n${worldMemories}\n`;
            
            finalPrompt += memorySection;
        }

        if (skillsPrompt) {
            finalPrompt += skillsPrompt;
        }

        return finalPrompt;
    } catch (e) {
        return BASE_PROMPT;
    }
};
