import { db } from './schema.js';
import { Message } from '../core/AppContext.js';

export const createSession = (name?: string) => {
    const stmt = db.prepare('INSERT INTO sessions (name) VALUES (?)');
    const info = stmt.run(name || `Session ${new Date().toLocaleString()}`);
    return info.lastInsertRowid;
};

export const getLastSession = () => {
    const stmt = db.prepare('SELECT id FROM sessions ORDER BY id DESC LIMIT 1');
    const row = stmt.get() as { id: number } | undefined;
    return row?.id;
};

export const getSessionMessageCount = (sessionId: number) => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?');
    const row = stmt.get(sessionId) as { count: number };
    return row.count;
};

export const getSessions = () => {
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY id DESC');
    return stmt.all() as { id: number, name: string, created_at: string }[];
};

export const updateSessionName = (id: number, name: string) => {
    const stmt = db.prepare('UPDATE sessions SET name = ? WHERE id = ?');
    stmt.run(name, id);
};

export const deleteSession = (id: number) => {
    db.transaction(() => {
        db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
        db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    })();
};

export const saveMessage = (sessionId: number, message: Message, provider?: string, model?: string) => {
    const stmt = db.prepare(`
        INSERT INTO messages (session_id, role, content, provider, model, tool_calls, tool_call_id, name, args)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
        sessionId,
        message.role, 
        message.content, 
        provider || null, 
        model || null,
        message.tool_calls ? JSON.stringify(message.tool_calls) : null,
        message.tool_call_id || null,
        message.name || null,
        message.args ? JSON.stringify(message.args) : null
    );
    return info.lastInsertRowid;
};

export const getMessages = (sessionId: number, limit: number = 100): Message[] => {
    const stmt = db.prepare(`
        SELECT role, content, tool_calls, tool_call_id, name, args FROM messages 
        WHERE session_id = ?
        ORDER BY id ASC LIMIT ?
    `);
    const rows = stmt.all(sessionId, limit) as any[];
    return rows.map(row => ({
        role: row.role as 'user' | 'assistant' | 'system' | 'tool',
        content: row.content,
        tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
        tool_call_id: row.tool_call_id,
        name: row.name,
        args: row.args ? JSON.parse(row.args) : undefined
    }));
};
