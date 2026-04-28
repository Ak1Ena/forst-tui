import fs from 'fs';
import path from 'path';
import { SKILLS_DIR } from './ConfigManager.js';

export interface Skill {
    name: string;
    description: string;
    content: string;
}

// ── mtime-based in-memory cache ───────────────────────────────────────────────
// Keyed by skill filename → last-known mtimeMs.
// We rebuild the skill list only when at least one file has a changed mtime,
// a file has been deleted, or a new file appeared.  This avoids re-reading
// all skill .md files from disk on every agent turn.
let _cachedSkills: Skill[] | null = null;
let _cachedMtimes: Map<string, number> = new Map();

function _skillsDirChanged(): boolean {
    if (!fs.existsSync(SKILLS_DIR)) return _cachedSkills !== null; // dir gone

    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md')).sort();
    const currentKeys = new Set(files);

    // Check for added / removed files
    if (currentKeys.size !== _cachedMtimes.size) return true;
    for (const f of files) {
        if (!_cachedMtimes.has(f)) return true; // new file
    }
    for (const [f] of _cachedMtimes) {
        if (!currentKeys.has(f)) return true; // deleted file
    }

    // Check mtimes for changes
    for (const f of files) {
        const filePath = path.join(SKILLS_DIR, f);
        try {
            const mtime = fs.statSync(filePath).mtimeMs;
            if (_cachedMtimes.get(f) !== mtime) return true;
        } catch {
            return true;
        }
    }

    return false;
}

export class SkillManager {
    public static loadSkills(): Skill[] {
        if (_cachedSkills !== null && !_skillsDirChanged()) {
            return _cachedSkills;
        }

        if (!fs.existsSync(SKILLS_DIR)) {
            _cachedSkills = [];
            _cachedMtimes = new Map();
            return _cachedSkills;
        }

        const files = fs.readdirSync(SKILLS_DIR);
        const skills: Skill[] = [];
        const newMtimes = new Map<string, number>();

        for (const file of files) {
            if (file.endsWith('.md')) {
                const filePath = path.join(SKILLS_DIR, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const mtime = fs.statSync(filePath).mtimeMs;
                    newMtimes.set(file, mtime);

                    // Extract description from first line if it's a header
                    const lines = content.split('\n');
                    let description = 'Specialized skill';
                    if (lines[0].startsWith('#')) {
                        description = lines[0].replace(/^#+\s*/, '');
                    }

                    skills.push({ name: file.replace('.md', ''), description, content });
                } catch {
                    // Skip unreadable skill files
                }
            }
        }

        _cachedSkills = skills;
        _cachedMtimes = newMtimes;
        return _cachedSkills;
    }

    public static getSkillsPrompt(): string {
        const skills = this.loadSkills();
        if (skills.length === 0) return '';

        let prompt = '\n\n--- AVAILABLE SKILLS ---\n';
        skills.forEach(skill => {
            prompt += `\n[Skill: ${skill.name}]\n${skill.content}\n`;
        });

        return prompt;
    }

    /** Bust the in-memory cache — call after writing or deleting skill files. */
    public static invalidateCache(): void {
        _cachedSkills = null;
        _cachedMtimes = new Map();
    }
}
