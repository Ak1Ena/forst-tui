import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Document } from "@langchain/core/documents";
import path from "path";
import fs from "fs";
import { GLOBAL_DIR } from "../core/ConfigManager.js";

// Prevent FAISS from crashing due to threading issues in some environments
process.env.OMP_NUM_THREADS = "1";

const VECTOR_STORE_PATH = path.join(GLOBAL_DIR, 'vector_store');

export class VectorMemory {
    private vectorStore: FaissStore | null = null;
    private embeddings: GoogleGenerativeAIEmbeddings | null = null;
    private apiKey: string;
    private initPromise: Promise<void> | null = null;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        // Only initialize embeddings if we have a key that looks like a Google key 
        if (apiKey && apiKey !== 'mock-key' && (apiKey.startsWith('AIza') || apiKey.length > 30)) {
            try {
                this.embeddings = new GoogleGenerativeAIEmbeddings({
                    apiKey: apiKey,
                    modelName: "embedding-001",
                });
            } catch (e) {
                // Silently fail to prevent crashes
            }
        }
    }

    async init() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._init();
        return this.initPromise;
    }

    private async _init() {
        if (!this.embeddings) return;
        const indexPath = path.join(VECTOR_STORE_PATH, 'faiss.index');
        if (fs.existsSync(indexPath)) {
            try {
                this.vectorStore = await FaissStore.load(VECTOR_STORE_PATH, this.embeddings);
            } catch (error) {
                // Silently ignore load errors
            }
        }
    }

    async addMessage(content: string, metadata: Record<string, any>) {
        if (!this.embeddings || !content || content.trim().length === 0) return;
        await this.init();
        
        const doc = new Document({ pageContent: content, metadata });
        
        try {
            // Check if embeddings actually work before calling FAISS
            // This prevents passing empty/null vectors to the native layer which causes SIGFPE
            const testEmbed = await this.embeddings.embedQuery("test");
            if (!testEmbed || testEmbed.length === 0) {
                return;
            }

            if (!this.vectorStore) {
                this.vectorStore = await FaissStore.fromDocuments([doc], this.embeddings);
            } else {
                await this.vectorStore.addDocuments([doc]);
            }
            
            await this.vectorStore.save(VECTOR_STORE_PATH);
        } catch (error) {
            // Native crashes (SIGFPE) are often uncatchable, but data validation above prevents them
        }
    }

    async search(query: string, k: number = 4) {
        await this.init();
        if (!this.vectorStore || !query) return [];
        try {
            return await this.similaritySearch(query, k);
        } catch (error) {
            return [];
        }
    }

    private async similaritySearch(query: string, k: number) {
        if (!this.vectorStore) return [];
        return await this.vectorStore.similaritySearch(query, k);
    }
}
