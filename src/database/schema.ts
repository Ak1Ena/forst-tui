import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { GLOBAL_DIR } from '../core/ConfigManager.js';

const DB_PATH = path.join(GLOBAL_DIR, 'forst.sqlite');

// Ensure data directory exists
if (!fs.existsSync(GLOBAL_DIR)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

// Initialize schema
export const initSchema = () => {
    // 1. Create sessions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Ensure messages table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 3. Migration: Add missing columns to messages
    const tableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
    const columns = tableInfo.map(c => c.name);

    const migrations = [
        { name: 'session_id', type: 'INTEGER' },
        { name: 'provider', type: 'TEXT' },
        { name: 'model', type: 'TEXT' },
        { name: 'tool_calls', type: 'TEXT' },
        { name: 'tool_call_id', type: 'TEXT' },
        { name: 'name', type: 'TEXT' },
        { name: 'args', type: 'TEXT' }
    ];

    for (const m of migrations) {
        if (!columns.includes(m.name)) {
            db.exec(`ALTER TABLE messages ADD COLUMN ${m.name} ${m.type}`);
        }
    }

    // 4. Create settings table
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    // 5. Create core_memories table for AI soul / Identity
    db.exec(`
        CREATE TABLE IF NOT EXISTS core_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL CHECK(category IN ('ai', 'user', 'world')),
            content TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
};
