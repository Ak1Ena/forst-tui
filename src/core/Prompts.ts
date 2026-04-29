import { getCoreMemories } from "../database/coreMemory.js";
import { SkillManager } from "./SkillManager.js";
import os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { GLOBAL_DIR } from "./ConfigManager.js";

const BASE_PROMPT = `# FORST-TUI AI AGENT

## ⚙️ PROTOCOL
1. **Research**: Use the **REPOSITORY INDEX** and **summerize** folder to understand project structure. DO NOT re-read raw files just for orientation; trust the index.
2. **Plan**: For multi-step tasks, output \`PLAN:\` JSON block.
3. **Surgical**: Use targeted line ranges for \`read_files\` and \`edit_file\` only when you need to see or change specific code.
4. **Validate**: Verify changes with tests/builds.

## 📏 RULES
- No conversational filler or preambles.
- Start response with result or PLAN immediately.
- Use \`core_memory\` for facts only.
- Finish tasks with "COMPLETED: <id>".
`;

// ─── In-memory cache for the static prompt ────────────────────────────────────
const _staticCache = new Map<boolean, string>();

export const invalidatePromptCache = () => _staticCache.clear();

function getProjectSlug(): string {
    const root = process.cwd();
    return crypto.createHash('sha1').update(root).digest('hex').substring(0, 10);
}

function getRepoIndexPath(): string {
    const projectName = path.basename(process.cwd());
    const projectSlug = getProjectSlug();
    return path.join(GLOBAL_DIR, 'folder', `${projectName}_${projectSlug}`, 'repo_index.md');
}

export const getStaticPrompt = (plannerMode: boolean = false): string => {
    if (_staticCache.has(plannerMode)) return _staticCache.get(plannerMode)!;

    let prompt = BASE_PROMPT;

    // Add Repo Index if available
    const indexPath = getRepoIndexPath();
    if (fs.existsSync(indexPath)) {
        try {
            const indexContent = fs.readFileSync(indexPath, 'utf8');
            prompt += `\n## 📂 REPOSITORY INDEX\n${indexContent}\n`;
        } catch (e) {
            // Ignore
        }
    }

    prompt += `\n## 👤 CONTEXT\n- **Env**: ${os.platform()} / Node.js TUI\n`;

    if (plannerMode) {
        prompt += `
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

    const skillsPrompt = SkillManager.getSkillsPrompt();
    if (skillsPrompt) {
        prompt += skillsPrompt;
    }

    _staticCache.set(plannerMode, prompt);
    return prompt;
};

export const getDynamicContext = (relevantMemories?: string, relevantConversation?: string): string => {
    let context = "";
    if (relevantMemories) {
        context += `\n\n--- RELEVANT CORE MEMORIES ---\n${relevantMemories}\n`;
    }
    if (relevantConversation) {
        context += `\n\n--- RELEVANT CONVERSATION CONTEXT ---\n${relevantConversation}\n[END CONTEXT]`;
    }
    return context;
};

export const getSystemPrompt = (plannerMode: boolean = false): string => {
    try {
        return getStaticPrompt(plannerMode) + getDynamicContext();
    } catch (e) {
        return BASE_PROMPT;
    }
};
