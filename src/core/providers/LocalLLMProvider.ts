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

    async chat(messages: Message[], tools?: any[]): Promise<Message> {
        const langchainMessages = this.mapMessages(messages);
        let modelWithTools: any = this.model;
        if (tools && tools.length > 0) {
            modelWithTools = (this.model as any).bind({
                tools: tools,
            });
        }

        
        const response = await modelWithTools.invoke(langchainMessages);
        return {
            role: 'assistant',
            content: response.content as string,
        };
    }

    async *streamChat(messages: Message[], tools?: any[]): AsyncGenerator<string, void, unknown> {
        const langchainMessages = this.mapMessages(messages);
        const stream = await this.model.stream(langchainMessages);
        for await (const chunk of stream) {
            yield chunk.content as string;
        }
    }
}
