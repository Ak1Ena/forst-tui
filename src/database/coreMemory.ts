import { db } from './schema.js';

export interface CoreMemory {
    id: number;
    category: 'ai' | 'user' | 'world';
    content: string;
}

export const addCoreMemory = (category: 'ai' | 'user' | 'world', content: string) => {
    try {
        const stmt = db.prepare('INSERT OR IGNORE INTO core_memories (category, content) VALUES (?, ?)');
        const info = stmt.run(category, content);
        return info.changes > 0 ? `Successfully remembered: ${content}` : `Already knew that: ${content}`;
    } catch (error: any) {
        return `Failed to save memory: ${error?.message || String(error)}`;
    }
};

export const deleteCoreMemory = (id: number) => {
    const stmt = db.prepare('DELETE FROM core_memories WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0 ? `Memory [${id}] deleted.` : `Memory [${id}] not found.`;
};

export const getCoreMemories = () => {
    const stmt = db.prepare('SELECT * FROM core_memories ORDER BY category, id');
    return stmt.all() as CoreMemory[];
};
