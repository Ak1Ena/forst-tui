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

// ─── In-memory cache for the static prompt ────────────────────────────────────
// keyed by plannerMode (true/false) so we never serve the wrong variant.
const _staticCache = new Map<boolean, string>();

/** Invalidate the static prompt cache — call after writing/deleting memories or skills. */
export const invalidatePromptCache = () => _staticCache.clear();

/**
 * Returns the STATIC portion of the system prompt.
 * This part is stable within a session (doesn't change per-turn) and is safe
 * to cache client-side AND to send with Anthropic `cache_control: ephemeral`.
 *
 * Includes: base rules, planner instructions, skills.
 * Does NOT include: core memories (those go in getDynamicContext).
 */
export const getStaticPrompt = (plannerMode: boolean = false): string => {
    if (_staticCache.has(plannerMode)) return _staticCache.get(plannerMode)!;

    let prompt = BASE_PROMPT;

    // Add stable environment info (platform doesn't change per-turn)
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

    // Skills are stable between skill add/delete operations (cache invalidated on write)
    const skillsPrompt = SkillManager.getSkillsPrompt();
    if (skillsPrompt) {
        prompt += skillsPrompt;
    }

    _staticCache.set(plannerMode, prompt);
    return prompt;
};

/**
 * Returns the DYNAMIC portion of the system prompt.
 * This part can change per-turn (memories updated, RAG context differs).
 * It should be injected as a separate, uncached block.
 *
 * Includes: core memories.
 */
export const getDynamicContext = (): string => {
    try {
        const memories = getCoreMemories();
        if (memories.length === 0) return '';

        const aiMemories = memories.filter(m => m.category === 'ai').map(m => `- ${m.content}`).join('\n');
        const userMemories = memories.filter(m => m.category === 'user').map(m => `- ${m.content}`).join('\n');
        const worldMemories = memories.filter(m => m.category === 'world').map(m => `- ${m.content}`).join('\n');

        let memorySection = '\n\n--- CORE MEMORIES (YOUR SOUL) ---\n';
        if (aiMemories) memorySection += `\nABOUT YOU (AI):\n${aiMemories}\n`;
        if (userMemories) memorySection += `\nABOUT THE USER:\n${userMemories}\n`;
        if (worldMemories) memorySection += `\nABOUT THE WORLD/PROJECT:\n${worldMemories}\n`;

        return memorySection;
    } catch {
        return '';
    }
};

/**
 * Returns the full combined system prompt (static + dynamic).
 * Used for compatibility with existing callers that expect a single string.
 * Prefer using getStaticPrompt() + getDynamicContext() separately in callModel
 * so the static part can be sent with Anthropic cache_control hints.
 */
export const getSystemPrompt = (plannerMode: boolean = false): string => {
    try {
        return getStaticPrompt(plannerMode) + getDynamicContext();
    } catch (e) {
        return BASE_PROMPT;
    }
};
