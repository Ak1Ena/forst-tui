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
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    // If there is no function call, then we finish
    if (!(lastMessage as any).tool_calls?.length) {
      return END;
    }
    // Otherwise we continue
    return "tools";
  };

  // Define the function that calls the model
  const callModel = async (state: typeof AgentState.State) => {
    const { messages, taskQueue } = state;
    
    // Inject task context into the system prompt or as a message if queue exists
    let activeMessages = [...messages];
    if (taskQueue.length > 0) {
        const pendingTasks = taskQueue.filter(t => t.status === 'pending' || t.status === 'in-progress');
        if (pendingTasks.length > 0) {
            const context = `[TASK QUEUE]\n${pendingTasks.map(t => `- ${t.description} [${t.status}]`).join('\n')}\n\nPlease focus on the next pending task. Update task status by mentioning "COMPLETED: <task_id>" in your response if you finish one.`;
            // Find system message to append or add new one
            activeMessages.push(new SystemMessage(context));
        }
    }

    const response = await modelWithTools.invoke(activeMessages);
    return { messages: [response] };
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
