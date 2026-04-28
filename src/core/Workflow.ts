import { Annotation, MessagesAnnotation, StateGraph, START, END, addMessages } from "@langchain/langgraph";
import { BaseMessage, SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { getTools } from "../tools/index.js";
import { BaseProvider } from "./providers/BaseProvider.js";
import { toolRetriever } from "./ToolRetriever.js";
import { vectorMemory } from "../database/vectorStore.js";
import { getStaticPrompt, getDynamicContext } from "./Prompts.js";
import { getCoreMemories } from "../database/coreMemory.js";
import { type Task, type TaskStatus } from "./AppContext.js";

// ── AgentState ────────────────────────────────────────────────────────────────
// Use addMessages reducer instead of plain concat — this enables in-graph
// message pruning via RemoveMessage (Fix H2).
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: addMessages,
    default: () => [],
  }),
  taskQueue: Annotation<Task[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
});

// Build the TF-IDF tool index lazily.
function ensureToolIndexBuilt(tools: any[]) {
    if (toolRetriever.getAll().length !== tools.length) {
        toolRetriever.build(tools);
    }
}

// ── Read-only tools whose results can be safely deduplicated ──────────────────
const CACHEABLE_TOOLS = new Set(['read_files', 'list_files', 'list_directory']);

/**
 * Returns true if any message in the list is a tool result.
 * The Anthropic endpoint requires toolConfig whenever toolUse/toolResult
 * content blocks exist in the conversation — even on follow-up turns.
 */
function hasToolHistory(msgs: BaseMessage[]): boolean {
    return msgs.some(m => m._getType() === 'tool');
}

/**
 * Extract the last human message content to use as the retrieval query.
 * Falls back to the last AI message if no human message is found.
 */
function getRetrievalQuery(msgs: BaseMessage[], currentTask?: Task): string {
    // Prefer current task description — it's the most focused signal
    if (currentTask) return `${currentTask.description}`;

    // Otherwise use the last human message
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]._getType() === 'human') {
            const content = msgs[i].content;
            return typeof content === 'string' ? content : '';
        }
    }
    return '';
}

/**
 * Dual-Query retrieval (Raw + Lightweight Rewrite) with Threshold.
 */
async function retrieveRelevantContext(messages: BaseMessage[], taskQueue: Task[]): Promise<string> {
    const rawQuery = getRetrievalQuery(messages, taskQueue.find(t => t.status === 'in-progress'));
    if (!rawQuery) return "";

    const queries = [
        rawQuery,
        `What past context is relevant to: ${rawQuery}?`
    ];

    const results = await Promise.all(queries.map(q => vectorMemory.search(q, 5, 0.5)));

    // Flatten, Deduplicate by content, and format
    const seen = new Set<string>();
    const uniqueDocs = results.flat().filter(doc => {
        if (seen.has(doc.pageContent)) return false;
        seen.add(doc.pageContent);
        return true;
    });

    if (uniqueDocs.length === 0) return "";

    return uniqueDocs.map(doc => {
        const timestamp = doc.metadata.timestamp ? new Date(doc.metadata.timestamp).toLocaleString() : 'Unknown';
        return `[MEMORIZED TURN - ${timestamp}]\n${doc.pageContent}`;
    }).join("\n---\n");
}

/**
 * Slice history to limit and ensure it starts at a safe boundary (Human message).
 */
export function truncateHistory(messages: BaseMessage[], limit: number): BaseMessage[] {
    const nonSystem = messages.filter(m => m._getType() !== 'system');
    let sliceIndex = Math.max(0, nonSystem.length - limit);

    while (sliceIndex > 0) {
        if (nonSystem[sliceIndex]._getType() === 'human') break;
        sliceIndex--;
    }
    return nonSystem.slice(sliceIndex);
}

/**
 * Anthropic requires every tool_use to have a corresponding tool_result.
 * Injects dummy results for orphaned tool calls (e.g. from an aborted run).
 */
export function sanitizeForAnthropic(messages: BaseMessage[]): BaseMessage[] {
    const sanitized: BaseMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        sanitized.push(msg);

        if (msg._getType() === 'ai' && (msg as any).tool_calls?.length) {
            const nextMsg = messages[i + 1];
            if (!nextMsg || nextMsg._getType() !== 'tool') {
                const toolCalls = (msg as any).tool_calls;
                for (const tc of toolCalls) {
                    sanitized.push(new ToolMessage({
                        content: "🛑 Operation cancelled by user. Discard this intent and wait for next instructions.",
                        tool_call_id: tc.id || 'unknown',
                        name: tc.name || 'unknown'
                    }));
                }
            }
        }
    }
    return sanitized;
}

/**
 * Sync task completions from the last assistant message and advance the queue.
 */
function syncTaskQueue(messages: BaseMessage[], taskQueue: Task[]): Task[] {
    let updatedQueue = [...taskQueue];
    const lastMessage = messages[messages.length - 1];
    
    // 1. Sync completions
    if (lastMessage && lastMessage._getType() === 'ai' && typeof lastMessage.content === 'string') {
        const content = lastMessage.content;
        const completedMatches = [...content.matchAll(/COMPLETED:\s*(\S+)/g)];
        for (const match of completedMatches) {
            const taskId = match[1].replace(/[^a-zA-Z0-9_-]/g, '');
            updatedQueue = updatedQueue.map(t =>
                t.id === taskId ? { ...t, status: 'completed' as TaskStatus } : t
            );
        }
    }

    // 2. Advance the queue
    const pendingTasks = updatedQueue.filter(t => t.status === 'pending' || t.status === 'in-progress');
    if (pendingTasks.length > 0 && !pendingTasks.some(t => t.status === 'in-progress')) {
        const firstPending = pendingTasks[0];
        updatedQueue = updatedQueue.map(t =>
            t.id === firstPending.id ? { ...t, status: 'in-progress' as TaskStatus } : t
        );
    }
    
    return updatedQueue;
}

/**
 * TF-IDF search for Core Memories.
 * Since core_memories is small, we can build a temporary index and search it.
 */
function retrieveRelevantMemories(query: string): string {
    const memories = getCoreMemories();
    if (memories.length === 0 || !query) return "";

    // Simple keyword matching/scoring for core memories
    const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
    if (queryTerms.length === 0) {
        // Fallback: if query is too short, return last 5 memories
        return memories.slice(-5).map(m => `(${m.category.toUpperCase()}) ${m.content}`).join('\n');
    }

    const scored = memories.map(m => {
        const content = m.content.toLowerCase();
        let score = 0;
        queryTerms.forEach(term => {
            if (content.includes(term)) score += 1;
        });
        return { memory: m, score };
    }).filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (scored.length === 0) {
        // Fallback: return last 3 memories
        return memories.slice(-3).map(m => `(${m.category.toUpperCase()}) ${m.content}`).join('\n');
    }

    return scored.map(s => `(${s.memory.category.toUpperCase()}) ${s.memory.content}`).join('\n');
}

export const createAgentWorkflow = (
  provider: BaseProvider,
  interactionMode: 'approval' | 'auto-accept' | 'yolo',
  checkpointer?: any,
  shortTermMemoryLimit: number = 12
) => {
  const tools = getTools();
  ensureToolIndexBuilt(tools);
  const model = provider.getModel();

  // Pre-build per-tool bound models lazily via a cache so we don't re-bind on every call.
  const boundModelCache = new Map<string, any>();
  const getModelForTools = (selectedTools: any[]): any => {
      if (!model.bindTools || selectedTools.length === 0) return model;
      const key = selectedTools.map((t: any) => t.name).sort().join(',');
      if (!boundModelCache.has(key)) {
          boundModelCache.set(key, model.bindTools(selectedTools));
      }
      return boundModelCache.get(key)!;
  };

  // ── Turn-scoped tool result dedup cache (Fix B) ───────────────────────────
  // Keyed by "toolName::JSON.stringify(sortedArgs)".
  // Only caches CACHEABLE_TOOLS (read-only). Never caches write/exec tools.
  // Reset at the start of each new human turn (cleared in callModel).
  const toolResultCache = new Map<string, string>();

  // Define the function that determines whether to continue or not
  const shouldContinue = (state: typeof AgentState.State) => {
    const { messages, taskQueue } = state;
    const lastMessage = messages[messages.length - 1];

    // If there is a tool call, we MUST run tools
    if ((lastMessage as any).tool_calls?.length) {
      return "tools";
    }

    // Check if there are still pending or in-progress tasks
    const hasMoreTasks = taskQueue.some(t => t.status === 'pending' || t.status === 'in-progress');

    if (hasMoreTasks) {
        if (interactionMode === 'yolo') {
            return "agent";
        }
        // If not YOLO, and we have a text response while tasks are still pending,
        // stop and wait for human feedback/answer.
        return END;
    }

    return END;
  };

  // plannerMode is passed via config.configurable or falls back to false
  const callModel = async (state: typeof AgentState.State, config?: any) => {
    const plannerMode: boolean = config?.configurable?.plannerMode ?? false;
    const { messages, taskQueue } = state;

    // --- 0. Dedup Cache Management ---
    const lastHumanIdx = [...messages].reverse().findIndex(m => m._getType() === 'human');
    if (lastHumanIdx === 0) toolResultCache.clear();

    // --- 1. Retrieval (Core Memories + Conversation RAG) ---
    const currentTask = taskQueue.find(t => t.status === 'in-progress');
    const query = getRetrievalQuery(messages, currentTask);
    
    const relevantMemories = retrieveRelevantMemories(query);
    const relevantConversation = await retrieveRelevantContext(messages, taskQueue);

    // --- 2. Build Context Blocks (Ordered: Static -> Dynamic) ---
    const systemBlocks: any[] = [
        { 
            type: "text", 
            text: getStaticPrompt(plannerMode), 
            cache_control: { type: "ephemeral" } // Anthropic stable prefix caching
        },
    ];

    const dynamicContext = getDynamicContext(relevantMemories, relevantConversation);
    if (dynamicContext) {
        systemBlocks.push({ type: "text", text: dynamicContext });
    }

    // --- 3. History Truncation (Recent Messages) ---
    const recentMessages = truncateHistory(messages, shortTermMemoryLimit);
    let activeMessages: BaseMessage[] = [new SystemMessage({ content: systemBlocks }), ...recentMessages];

    // --- 4. Sanitization (Anthropic Compliance) ---
    activeMessages = sanitizeForAnthropic(activeMessages);

    // --- 5. Task Queue Sync & Injection ---
    let updatedQueue = syncTaskQueue(activeMessages, taskQueue);
    const syncCurrentTask = updatedQueue.find(t => t.status === 'in-progress');

    if (syncCurrentTask && syncCurrentTask.status !== 'failed') {
        const remaining = updatedQueue.filter(t => t.status === 'pending').length;
        const taskContext = `\n\n[CURRENT TASK] (ID: ${syncCurrentTask.id})\n${syncCurrentTask.description}\n\n` +
            (remaining > 0 ? `(${remaining} more task${remaining > 1 ? 's' : ''} queued after this)\n\n` : '') +
            `When you finish this task, write "COMPLETED: ${syncCurrentTask.id}" in your response.`;

        const firstMsg = activeMessages[0] as SystemMessage;
        if (Array.isArray(firstMsg.content)) {
            activeMessages[0] = new SystemMessage({ content: [...firstMsg.content, { type: "text", text: taskContext }] });
        } else {
            activeMessages[0] = new SystemMessage(`${firstMsg.content}\n\n${taskContext}`);
        }
    }

    // --- 6. Tool Selection & Model Binding (Top-K Tools / Catalog) ---
    const toolHistory = hasToolHistory(activeMessages);
    let chosenModel: any;

    if (toolHistory) {
        chosenModel = getModelForTools(tools);
    } else {
        const retrievedTools = query ? toolRetriever.search(query, 3) : [];
        if (retrievedTools.length > 0) {
            chosenModel = getModelForTools(retrievedTools.map(e => e.tool));
        } else {
            chosenModel = model;
            const catalog = toolRetriever.getCatalog();
            if (catalog) {
                const firstMsg = activeMessages[0] as SystemMessage;
                if (Array.isArray(firstMsg.content)) {
                    activeMessages[0] = new SystemMessage({ content: [...firstMsg.content, { type: "text", text: catalog }] });
                } else {
                    activeMessages[0] = new SystemMessage(`${firstMsg.content}\n\n${catalog}`);
                }
            }
        }
    }

    const response = await chosenModel.invoke(activeMessages, config);
    return {
        messages: [response],
        taskQueue: updatedQueue,
    };
  };

  // ── Parallel tool execution with turn-scoped dedup cache (Fix A + B) ────────
  // Wraps every tool call: cacheable reads return instantly on cache hit;
  // all calls in a single LLM response are dispatched concurrently.
  const parallelToolNode = async (state: typeof AgentState.State, config?: any) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || !(lastMessage as any).tool_calls?.length) {
        return { messages: [] };
    }

    const toolCalls: any[] = (lastMessage as any).tool_calls;
    const toolMap = new Map(tools.map((t: any) => [t.name, t]));

    // Dispatch all tool calls concurrently
    const results = await Promise.all(
        toolCalls.map(async (tc: any) => {
            const tool = toolMap.get(tc.name);
            if (!tool) {
                return new ToolMessage({
                    content: `Error: Unknown tool "${tc.name}"`,
                    tool_call_id: tc.id || 'unknown',
                    name: tc.name,
                });
            }

            const start = Date.now();
            let result: any;
            let isFromCache = false;

            // Dedup cache — only for safe read-only tools
            if (CACHEABLE_TOOLS.has(tc.name)) {
                const cacheKey = `${tc.name}::${JSON.stringify(tc.args)}`;
                if (toolResultCache.has(cacheKey)) {
                    result = toolResultCache.get(cacheKey)!;
                    isFromCache = true;
                } else {
                    result = await tool.invoke(tc.args, config);
                    toolResultCache.set(cacheKey, result);
                }
            } else {
                // Non-cacheable: invoke directly
                result = await tool.invoke(tc.args, config);
            }

            const duration = isFromCache ? 0 : (Date.now() - start);
            if (config?.configurable?.onToolCall) {
                try {
                    config.configurable.onToolCall(tc.name, duration);
                } catch (e) { /* ignore */ }
            }

            return new ToolMessage({
                content: typeof result === 'string' ? result : JSON.stringify(result),
                tool_call_id: tc.id || 'unknown',
                name: tc.name,
            });
        })
    );

    return { messages: results };
  };

  // Define a new graph
  const workflow = new StateGraph(AgentState)
    .addNode("agent", callModel)
    .addNode("tools", parallelToolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  return workflow.compile({
    checkpointer,
    interruptBefore: interactionMode === 'approval' ? ["tools"] : undefined
  });
};
