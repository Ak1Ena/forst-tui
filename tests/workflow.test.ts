import { describe, it, expect, vi } from 'vitest';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from "@langchain/core/messages";

// Mock imports that trigger DB/Better-SQLite3 initialization
vi.mock('../src/database/vectorStore.js', () => ({
    vectorMemory: {
        search: vi.fn(),
        addMessage: vi.fn(),
        init: vi.fn()
    }
}));
vi.mock('../src/tools/index.js', () => ({
    getTools: vi.fn(() => [])
}));
vi.mock('../src/core/Prompts.js', () => ({
    getStaticPrompt: vi.fn(),
    getDynamicContext: vi.fn()
}));

import { truncateHistory, sanitizeForAnthropic } from '../src/core/Workflow.js';

describe('Workflow Helpers', () => {
    describe('truncateHistory', () => {
        it('should slice history and ensure it starts with a human message', () => {
            const messages = [
                new HumanMessage("hello"),
                new AIMessage("hi"),
                new HumanMessage("how are you?"),
                new AIMessage("I am good"),
                new HumanMessage("tell me a joke")
            ];
            
            // Limit 3 should take [Human("how are you?"), AI("I am good"), Human("tell me a joke")]
            const truncated = truncateHistory(messages, 3);
            expect(truncated.length).toBe(3);
            expect(truncated[0].content).toBe("how are you?");
        });

        it('should walk back to find a human message if slice ends on AI', () => {
            const messages = [
                new HumanMessage("m1"),
                new AIMessage("m2"),
                new HumanMessage("m3"),
                new AIMessage("m4"),
            ];
            // Limit 2 would start at m3.
            const truncated = truncateHistory(messages, 2);
            expect(truncated.length).toBe(2);
            expect(truncated[0]._getType()).toBe('human');
        });
    });

    describe('sanitizeForAnthropic', () => {
        it('should inject dummy results for orphaned tool calls', () => {
            const messages = [
                new HumanMessage("run tool"),
                new AIMessage({
                    content: "",
                    tool_calls: [{ id: "1", name: "test", args: {} }]
                })
            ];
            
            const sanitized = sanitizeForAnthropic(messages);
            expect(sanitized.length).toBe(3);
            expect(sanitized[2]).toBeInstanceOf(ToolMessage);
            expect((sanitized[2] as ToolMessage).tool_call_id).toBe("1");
        });

        it('should not inject if tool result exists', () => {
            const messages = [
                new HumanMessage("run tool"),
                new AIMessage({
                    content: "",
                    tool_calls: [{ id: "1", name: "test", args: {} }]
                }),
                new ToolMessage({ content: "ok", tool_call_id: "1", name: "test" })
            ];
            
            const sanitized = sanitizeForAnthropic(messages);
            expect(sanitized.length).toBe(3);
        });
    });
});
