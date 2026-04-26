import { describe, it, expect } from 'vitest';
import { BaseProvider } from '../src/core/providers/BaseProvider.js';
import { Message } from '../src/core/AppContext.js';

class MockProvider extends BaseProvider {
    async chat(messages: Message[]): Promise<Message> {
        return { role: 'assistant', content: 'mock response' };
    }
    async *streamChat(messages: Message[]): AsyncGenerator<string, void, unknown> {
        yield 'mock';
        yield ' response';
    }
}

describe('BaseProvider', () => {
    it('should be correctly extended', async () => {
        const provider = new MockProvider({});
        const response = await provider.chat([]);
        expect(response.content).toBe('mock response');
    });
});
