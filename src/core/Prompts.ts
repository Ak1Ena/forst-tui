import { getCoreMemories } from "../database/coreMemory.js";
import { SkillManager } from "./SkillManager.js";
import os from 'os';

const BASE_PROMPT = `# FORST-TUI AI AGENT

## ⚙️ PROTOCOL
1. **Research**: Map codebase via \`list_files\` or \`run_command\` before changes.
2. **Plan**: For multi-step tasks, output \`PLAN:\` JSON block.
3. **Surgical**: Use targeted line ranges for \`read_files\` and \`edit_file\`. 
4. **Validate**: Verify changes with tests/builds.

## 📏 RULES
- No conversational filler or preambles.
- Start response with result or PLAN immediately.
- Use \`core_memory\` for facts only.
- Finish tasks with "COMPLETED: <id>".
`;

export const getSystemPrompt = (plannerMode: boolean = false) => {
    try {
        const memories = getCoreMemories();
        const skillsPrompt = SkillManager.getSkillsPrompt();
        
        let finalPrompt = BASE_PROMPT;

        // Add dynamic environment info
        finalPrompt += `\n## 👤 CONTEXT\n- **Env**: ${os.platform()} / Node.js TUI\n`;

        if (plannerMode) {
            finalPrompt += `
\n--- CRITICAL: PLANNER MODE ACTIVE ---
You are operating in COWORKER PLANNER MODE.
- For ANY multi-step request, you MUST start by generating a plan before using any tools.
- Format the plan as a JSON array inside a code block, preceded by "PLAN:".
- Example:
PLAN:
\`\`\`json
[
  {"id": "step1", "description": "Read the source code"},
  {"id": "step2", "description": "Implement the fix"}
]
\`\`\`
- After outputting the plan, focus ONLY on the task shown in [CURRENT TASK].
- Do NOT jump ahead to future tasks — execute exactly one task at a time.
- When you finish a task, you MUST write "COMPLETED: <task_id>" (exactly as shown) to advance the queue.
- Do not write COMPLETED until all tool calls for that task are done and verified.
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
