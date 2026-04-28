import { ProviderConfig } from '../ConfigManager.js';
import { GeminiProvider } from './GeminiProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { LocalLLMProvider } from './LocalLLMProvider.js';
import { BaseProvider } from './BaseProvider.js';

export class ProviderFactory {
    static create(config: ProviderConfig): BaseProvider {
        switch (config.type) {
            case 'gemini':
                return new GeminiProvider({
                    apiKey: config.apiKey,
                    model: config.model
                });
            case 'openai':
            case 'openrouter':
                return new OpenAIProvider({
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                    model: config.model
                });
            case 'anthropic':
                return new AnthropicProvider({
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                    model: config.model
                });
            case 'ollama':
                return new LocalLLMProvider({
                    baseUrl: config.baseUrl,
                    model: config.model
                });
            default:
                throw new Error(`Unsupported provider type: ${config.type}`);
        }
    }
}
