import { Message } from '../AppContext.js';

export interface ProviderOptions {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

export abstract class BaseProvider {
    protected options: ProviderOptions;

    constructor(options: ProviderOptions) {
        this.options = options;
    }

    abstract chat(messages: Message[], tools?: any[]): Promise<Message>;
    abstract streamChat(messages: Message[], tools?: any[]): AsyncGenerator<string, void, unknown>;
}
