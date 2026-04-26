import fs from 'fs';
import path from 'path';
import { SKILLS_DIR } from './ConfigManager.js';

export interface Skill {
    name: string;
    description: string;
    content: string;
}

export class SkillManager {
    public static loadSkills(): Skill[] {
        if (!fs.existsSync(SKILLS_DIR)) return [];

        const files = fs.readdirSync(SKILLS_DIR);
        const skills: Skill[] = [];

        for (const file of files) {
            if (file.endsWith('.md')) {
                const filePath = path.join(SKILLS_DIR, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                
                // Extract description from first line if it's a comment or header
                const lines = content.split('\n');
                let description = 'Specialized skill';
                if (lines[0].startsWith('#')) {
                    description = lines[0].replace(/^#+\s*/, '');
                }

                skills.push({
                    name: file.replace('.md', ''),
                    description,
                    content
                });
            }
        }

        return skills;
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
}
