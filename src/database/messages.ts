import { db } from './schema.js';
import { Message } from '../core/AppContext.js';

export const saveMessage = (message: Message, provider?: string, model?: string) => {
    const stmt = db.prepare(`
        INSERT INTO messages (role, content, provider, model)
        VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(message.role, message.content, provider || null, model || null);
    return info.lastInsertRowid;
};

export const getMessages = (limit: number = 50): Message[] => {
    const stmt = db.prepare(`
        SELECT role, content FROM (
            SELECT id, role, content FROM messages ORDER BY id DESC LIMIT ?
        ) ORDER BY id ASC
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map(row => ({
        role: row.role as 'user' | 'assistant' | 'system' | 'tool',
        content: row.content
    }));
};
