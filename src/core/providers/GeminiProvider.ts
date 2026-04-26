import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseProvider, ProviderOptions } from "./BaseProvider.js";
import { Message } from "../AppContext.js";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";

export class GeminiProvider extends BaseProvider {
    private model: ChatGoogleGenerativeAI;

    constructor(options: ProviderOptions) {
        super(options);
        this.model = new ChatGoogleGenerativeAI({
            apiKey: options.apiKey,
            model: options.model || "gemini-pro",
        });
    }

    private mapMessages(messages: Message[]): BaseMessage[] {
        return messages.map(m => {
            switch (m.role) {
                case 'user': return new HumanMessage(m.content);
                case 'assistant': return new AIMessage({ content: m.content, tool_calls: m.tool_calls });
                case 'system': return new SystemMessage(m.content);
                case 'tool': return new ToolMessage({ content: m.content, tool_call_id: m.tool_call_id || '', name: m.name });
                default: return new HumanMessage(m.content);
            }
        });
    }

    async chat(messages: Message[], tools?: any[], signal?: AbortSignal): Promise<Message> {
        const langchainMessages = this.mapMessages(messages);
        let modelWithTools: any = this.model;
        if (tools && tools.length > 0) {
            if (typeof (this.model as any).bindTools === 'function') {
                modelWithTools = (this.model as any).bindTools(tools);
            } else {
                modelWithTools = (this.model as any).bind({
                    tools: tools,
                });
            }
        }
        
        const response = await modelWithTools.invoke(langchainMessages, { signal });
        return {
            role: 'assistant',
            content: (response.content as string) || '',
            tool_calls: (response as any).tool_calls,
        };
    }

    async *streamChat(messages: Message[], tools?: any[], signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
        const langchainMessages = this.mapMessages(messages);
        const stream = await this.model.stream(langchainMessages, { signal });
        for await (const chunk of stream) {
            yield chunk.content as string;
        }
    }
}
