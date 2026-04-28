import { describe, it, expect, vi } from 'vitest';

// No DB imports in ToolRetriever.ts currently, but good to be safe if it changes
import { ToolRetriever } from '../src/core/ToolRetriever.js';

describe('ToolRetriever', () => {
    it('should retrieve tools based on TF-IDF similarity', () => {
        const retriever = new ToolRetriever();
        const mockTools = [
            { name: 'read_files', description: 'Read content from files' },
            { name: 'run_command', description: 'Execute shell commands' },
            { name: 'search_web', description: 'Search the internet' }
        ];
        
        retriever.build(mockTools);
        
        const results = retriever.search('how to read a file?');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe('read_files');
    });

    it('should return empty if no good match is found', () => {
        const retriever = new ToolRetriever();
        retriever.build([{ name: 'x', description: 'y' }]);
        
        const results = retriever.search('something completely unrelated');
        // Threshold should prevent returning 'x'
        expect(results.length).toBe(0);
    });

    it('should provide a catalog of all tools', () => {
        const retriever = new ToolRetriever();
        retriever.build([
            { name: 't1', description: 'd1' },
            { name: 't2', description: 'd2' }
        ]);
        
        const catalog = retriever.getCatalog();
        expect(catalog).toContain('t1');
        expect(catalog).toContain('t2');
    });
});
