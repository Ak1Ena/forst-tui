import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { getTools } from "../tools/index.js";
import { BaseProvider } from "./providers/BaseProvider.js";

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
    reducer: (x, y) => y ?? x, // Overwrite with new queue if provided
    default: () => [],
  }),
});

export const createAgentWorkflow = (provider: BaseProvider, checkpointer?: any, interrupt?: boolean) => {
  const tools = getTools();
  const model = provider.getModel();
  
  // Bind tools to the model if it supports it
  const modelWithTools = model.bindTools ? model.bindTools(tools) : model;

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
    
    // If we have more tasks, loop back to the agent to start the next one
    if (hasMoreTasks) {
        return "agent";
    }

    // Otherwise we finish
    return END;
  };

  // Define the function that calls the model
  const callModel = async (state: typeof AgentState.State) => {
    const { messages, taskQueue } = state;
    
    // Update taskQueue based on the LAST message content if it was from assistant
    let updatedQueue = [...taskQueue];
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage._getType() === 'ai' && typeof lastMessage.content === 'string') {
        const content = lastMessage.content;
        if (content.includes('COMPLETED:')) {
            const match = content.match(/COMPLETED:\s*(\w+)/);
            if (match && match[1]) {
                updatedQueue = updatedQueue.map(t => 
                    t.id === match[1] ? { ...t, status: 'completed' } : t
                );
            }
        }
    }

    // Inject task context into the system prompt or as a message if queue exists
    let activeMessages = [...messages];
    const pendingTasks = updatedQueue.filter(t => t.status === 'pending' || t.status === 'in-progress');
    
    if (pendingTasks.length > 0) {
        // Mark the first pending task as in-progress if none are
        if (!pendingTasks.some(t => t.status === 'in-progress')) {
            const firstPending = pendingTasks[0];
            updatedQueue = updatedQueue.map(t => t.id === firstPending.id ? { ...t, status: 'in-progress' } : t);
        }

        const currentTasks = updatedQueue.filter(t => t.status === 'pending' || t.status === 'in-progress');
        const context = `[TASK QUEUE STATUS]\n${currentTasks.map(t => `- ${t.description} [${t.status}] (ID: ${t.id})`).join('\n')}\n\nINSTRUCTION: Work on the next "in-progress" task. When finished with a task, you MUST write "COMPLETED: <task_id>" in your response.`;
        activeMessages.push(new SystemMessage(context));
    }

    const response = await modelWithTools.invoke(activeMessages);
    return { 
        messages: [response],
        taskQueue: updatedQueue // Persist the updated queue status in the graph state
    };
  };

  // Define a new graph
  const workflow = new StateGraph(AgentState)
    .addNode("agent", callModel)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges(
      "agent",
      shouldContinue
    )
    .addEdge("tools", "agent");

  return workflow.compile({
    checkpointer,
    interruptBefore: interrupt ? ["tools"] : undefined
  });
};
