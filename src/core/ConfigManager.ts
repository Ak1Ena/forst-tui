import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ProviderConfig {
    id: string;
    name: string;
    type: 'openai' | 'gemini' | 'ollama' | 'openrouter' | string;
    apiKey?: string;
    baseUrl?: string;
    model: string;
    enabled: boolean;
}

export interface AppSettings {
    defaultProvider: string;
    theme: string;
    recursionLimit: number;
    interactionMode: 'approval' | 'auto-accept' | 'yolo';
    plannerMode: boolean;
    providers: ProviderConfig[];
}

export const GLOBAL_DIR = path.join(os.homedir(), '.forst-tui');
export const SKILLS_DIR = path.join(GLOBAL_DIR, 'skills');
const CONFIG_PATH = path.join(GLOBAL_DIR, 'settings.config.json');

// Ensure directories exist
[GLOBAL_DIR, SKILLS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const DEFAULT_CONFIG: AppSettings = {
    defaultProvider: 'gemini-default',
    theme: 'default',
    recursionLimit: 50,
    interactionMode: 'yolo',
    plannerMode: false,
    providers: [
        {
            id: 'gemini-default',
            name: 'Gemini (Default)',
            type: 'gemini',
            apiKey: '',
            model: 'gemini-pro',
            enabled: true
        }
    ]
};

export class ConfigManager {
    private settings: AppSettings;

    constructor() {
        this.settings = this.load();
    }

    private load(): AppSettings {
        if (fs.existsSync(CONFIG_PATH)) {
            try {
                const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
                return JSON.parse(data);
            } catch (e) {
                console.error('Failed to parse config, using defaults');
                return DEFAULT_CONFIG;
            }
        }
        this.save(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
    }

    public save(settings: AppSettings = this.settings) {
        this.settings = settings;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2));
    }

    public getSettings() {
        return this.settings;
    }

    public addProvider(provider: ProviderConfig) {
        this.settings.providers.push(provider);
        this.save();
    }

    public updateProvider(id: string, updates: Partial<ProviderConfig>) {
        this.settings.providers = this.settings.providers.map(p => 
            p.id === id ? { ...p, ...updates } : p
        );
        this.save();
    }

    public getActiveProvider(): ProviderConfig | undefined {
        return this.settings.providers.find(p => p.id === this.settings.defaultProvider);
    }
}

export const configManager = new ConfigManager();
