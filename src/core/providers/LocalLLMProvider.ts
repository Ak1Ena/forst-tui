import { ChatOllama } from "@langchain/ollama";
import { BaseProvider, ProviderOptions } from "./BaseProvider.js";
import { Message } from "../AppContext.js";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";

export class LocalLLMProvider extends BaseProvider {
    private model: ChatOllama;

    constructor(options: ProviderOptions) {
        super(options);
        this.model = new ChatOllama({
            baseUrl: options.baseUrl || "http://localhost:11434",
            model: options.model || "llama3",
        });
    }

    private mapMessages(messages: Message[]): BaseMessage[] {
        return messages.map(m => {
            switch (m.role) {
                case 'user': return new HumanMessage(m.content);
                case 'assistant': return new AIMessage(m.content);
                case 'system': return new SystemMessage(m.content);
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
        if (!response) {
            throw new Error('Local LLM returned no response');
        }
        return {
            role: 'assistant',
            content: (typeof response.content === 'string' ? response.content : JSON.stringify(response.content)) || '',
        };
    }

    async *streamChat(messages: Message[], tools?: any[], signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
        const langchainMessages = this.mapMessages(messages);
        const stream = await this.model.stream(langchainMessages, { signal });
        for await (const chunk of stream) {
            yield chunk.content as string;
        }
    }

    getModel() {
        return this.model;
    }
}
