import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { BaseMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { getTools } from "../tools/index.js";
import { BaseProvider } from "./providers/BaseProvider.js";
import { toolRetriever } from "./ToolRetriever.js";

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed';
export type Task = {
    id: string;
    description: string;
    status: TaskStatus;
};

// Define the state interface
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  taskQueue: Annotation<Task[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
});

// Build the TF-IDF tool index once at module load time.
// getTools() returns the same registry array every call so this is safe.
toolRetriever.build(getTools());

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

export const createAgentWorkflow = (
  provider: BaseProvider, 
  interactionMode: 'approval' | 'auto-accept' | 'yolo',
  checkpointer?: any
) => {
  const tools = getTools();
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

  // Define the function that calls the model
  const callModel = async (state: typeof AgentState.State, config?: any) => {
    const { messages, taskQueue } = state;

    // --- 0. Sanitize messages for Anthropic/strict providers ---
    // Anthropic requires that system messages ONLY appear at the very beginning.
    // We consolidate all system messages into one to avoid "System messages are only permitted as the first passed message" errors.
    let systemContent = "";
    const nonSystemMessages: BaseMessage[] = [];
    
    for (const m of messages) {
        if (m._getType() === 'system') {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            if (systemContent) systemContent += "\n\n";
            systemContent += content;
        } else {
            nonSystemMessages.push(m);
        }
    }
    
    let activeMessages: BaseMessage[] = systemContent 
        ? [new SystemMessage(systemContent), ...nonSystemMessages]
        : nonSystemMessages;

    // --- 1. Sync task completions from the last assistant message ---
    let updatedQueue = [...taskQueue];
    const lastMessage = activeMessages[activeMessages.length - 1];
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

    // --- 2. Advance the queue: mark next pending as in-progress ---
    const pendingTasks = updatedQueue.filter(t => t.status === 'pending' || t.status === 'in-progress');
    if (pendingTasks.length > 0 && !pendingTasks.some(t => t.status === 'in-progress')) {
        const firstPending = pendingTasks[0];
        updatedQueue = updatedQueue.map(t =>
            t.id === firstPending.id ? { ...t, status: 'in-progress' as TaskStatus } : t
        );
    }

    // --- 3. Inject ONLY the current in-progress task into the system prompt ---
    const currentTask = updatedQueue.find(t => t.status === 'in-progress');

    if (currentTask) {
        const remaining = updatedQueue.filter(t => t.status === 'pending').length;
        const taskContext =
            `[CURRENT TASK] (ID: ${currentTask.id})\n${currentTask.description}\n\n` +
            (remaining > 0 ? `(${remaining} more task${remaining > 1 ? 's' : ''} queued after this)\n\n` : '') +
            `When you finish this task, write "COMPLETED: ${currentTask.id}" in your response.`;

        const firstMsg = activeMessages[0];
        if (firstMsg && firstMsg._getType() === 'system') {
            const existing = typeof firstMsg.content === 'string' ? firstMsg.content : '';
            activeMessages[0] = new SystemMessage(`${existing}\n\n${taskContext}`);
        } else {
            activeMessages = [new SystemMessage(taskContext), ...activeMessages];
        }
    }

    // --- 4. Smart tool selection via TF-IDF retrieval ---
    //
    // The Anthropic endpoint REQUIRES toolConfig whenever any tool/toolResult
    // messages exist in history — so we always send tools in that case.
    //
    // For fresh turns with no tool history:
    //   - Retrieve top-3 relevant tools via TF-IDF against the current query
    //   - If nothing matches, inject only the tool catalog (names only) so the
    //     model knows tools exist without paying full schema cost
    const toolHistory = hasToolHistory(activeMessages);
    let chosenModel: any;

    if (toolHistory) {
        // Must send full tools — Anthropic requires it when tool messages exist
        chosenModel = getModelForTools(tools);
    } else {
        const query = getRetrievalQuery(activeMessages, currentTask);
        const retrieved = query ? toolRetriever.search(query, 3) : [];

        if (retrieved.length > 0) {
            // Bind only the retrieved subset
            chosenModel = getModelForTools(retrieved.map(e => e.tool));
        } else {
            // Fallback: no tools bound, inject catalog as a system note so the
            // model can reference tool names without any schema overhead
            chosenModel = model;
            const catalog = toolRetriever.getCatalog();
            if (catalog) {
                const firstMsg = activeMessages[0];
                if (firstMsg && firstMsg._getType() === 'system') {
                    const existing = typeof firstMsg.content === 'string' ? firstMsg.content : '';
                    activeMessages[0] = new SystemMessage(`${existing}\n\n${catalog}`);
                } else {
                    activeMessages = [new SystemMessage(catalog), ...activeMessages];
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

  // Define a new graph
  const workflow = new StateGraph(AgentState)
    .addNode("agent", callModel)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  return workflow.compile({
    checkpointer,
    interruptBefore: interactionMode === 'approval' ? ["tools"] : undefined
  });
};
