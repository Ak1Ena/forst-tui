import { Message } from '../AppContext.js';

export interface ProviderOptions {
    apiKey?: string;
    accessToken?: string;
    authType?: 'apiKey' | 'oauth';
    baseUrl?: string;
    model?: string;
}

export abstract class BaseProvider {
    protected options: ProviderOptions;

    constructor(options: ProviderOptions) {
        this.options = options;
    }

    abstract chat(messages: Message[], tools?: any[], signal?: AbortSignal): Promise<Message>;
    abstract streamChat(messages: Message[], tools?: any[], signal?: AbortSignal): AsyncGenerator<string, void, unknown>;
    abstract getModel(): any;
}
