import { getTools } from "../tools/index.js";

export class ForstAgent {
    private provider: any;

    constructor(provider: any) {
        this.provider = provider;
    }

    async init() {
        // Simplified initialization for prototype
    }

    async run(input: string, onUpdate: (chunk: string) => void) {
        onUpdate("Thinking...");
        const response = await this.provider.chat([{ role: 'user', content: input }], getTools());
        return response.content;
    }
}
