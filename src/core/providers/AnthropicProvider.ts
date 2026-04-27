import { ChatAnthropic } from "@langchain/anthropic";
import { BaseProvider, ProviderOptions } from "./BaseProvider.js";
import { Message } from "../AppContext.js";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";

export class AnthropicProvider extends BaseProvider {
    private model: ChatAnthropic;

    constructor(options: ProviderOptions) {
        super(options);
        this.model = new ChatAnthropic({
            apiKey: options.apiKey,
            modelName: options.model || "claude-3-5-sonnet-20240620",
            clientOptions: {
                baseURL: options.baseUrl,
            }
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
            modelWithTools = (this.model as any).bindTools(tools);
        }

        const response = await modelWithTools.invoke(langchainMessages, { signal });
        if (!response) {
            throw new Error('Anthropic API returned no response');
        }
        return {
            role: 'assistant',
            content: (typeof response.content === 'string' ? response.content : JSON.stringify(response.content)) || '',
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

    getModel() {
        return this.model;
    }
}
