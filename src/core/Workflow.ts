import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { getTools } from "../tools/index.js";
import { BaseProvider } from "./providers/BaseProvider.js";

// Define the state interface
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

export const createAgentWorkflow = (provider: BaseProvider) => {
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
    const { messages } = state;
    const response = await modelWithTools.invoke(messages);
    // We return a list, because this will get added to the existing list
    return { messages: [response] };
  };

  // Define a new graph
  const workflow = new StateGraph(AgentState)
    // Define the two nodes we will cycle between
    .addNode("agent", callModel)
    .addNode("tools", new ToolNode(tools))
    // Set the entrypoint as `agent`
    .addEdge(START, "agent")
    // We now add a conditional edge
    .addConditionalEdges(
      // First, we define the start node. We use `agent`.
      // This means these are the edges taken after the `agent` node is called.
      "agent",
      // Next, we pass in the function that will determine which node is called next.
      shouldContinue
    )
    // We now add a normal edge from `tools` to `agent`.
    // This means after `tools` is called, `agent` node is called next.
    .addEdge("tools", "agent");

  // Finally, we compile it!
  // This compiles it into a LangChain Runnable,
  // meaning you can use it as you would any other runnable
  return workflow.compile();
};
