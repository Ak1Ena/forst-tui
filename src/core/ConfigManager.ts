import fs from 'fs';
import path from 'path';

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
    providers: ProviderConfig[];
}

const CONFIG_PATH = path.join(process.cwd(), 'settings.config.json');

const DEFAULT_CONFIG: AppSettings = {
    defaultProvider: 'gemini-default',
    theme: 'default',
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
