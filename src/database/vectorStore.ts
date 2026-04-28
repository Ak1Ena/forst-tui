import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Document } from "@langchain/core/documents";
import path from "path";
import fs from "fs";
import { GLOBAL_DIR } from "../core/ConfigManager.js";

// Prevent FAISS from crashing due to threading issues in some environments
process.env.OMP_NUM_THREADS = "1";

// Using a model-specific path so we don't try to load incompatible indexes
const VECTOR_STORE_PATH = path.join(GLOBAL_DIR, 'vector_store_bge');

export class VectorMemory {
    private vectorStore: FaissStore | null = null;
    private embeddings: HuggingFaceTransformersEmbeddings | null = null;
    private initPromise: Promise<void> | null = null;

    constructor() {
        try {
            this.embeddings = new HuggingFaceTransformersEmbeddings({
                model: "Xenova/bge-m3",
            });
        } catch (e) {
            console.error('Failed to initialize local embeddings:', e);
        }
    }

    async init() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._init();
        return this.initPromise;
    }

    private async _init() {
        if (!this.embeddings) return;
        
        // Ensure the directory exists
        if (!fs.existsSync(VECTOR_STORE_PATH)) {
            fs.mkdirSync(VECTOR_STORE_PATH, { recursive: true });
        }

        const indexPath = path.join(VECTOR_STORE_PATH, 'faiss.index');
        if (fs.existsSync(indexPath)) {
            try {
                this.vectorStore = await FaissStore.load(VECTOR_STORE_PATH, this.embeddings);
            } catch (error) {
                // If loading fails (e.g. corrupt or incompatible), we'll start fresh
                this.vectorStore = null;
            }
        }
    }

    async addMessage(content: string, metadata: Record<string, any>) {
        if (!this.embeddings || !content || content.trim().length === 0) return;
        await this.init();
        
        const doc = new Document({ pageContent: content, metadata });
        
        try {
            // Check if embeddings actually work before calling FAISS
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
            console.error('VectorMemory addMessage error:', error);
        }
    }

    async search(query: string, k: number = 4, threshold: number = 0.5) {
        await this.init();
        if (!this.vectorStore || !query) return [];
        try {
            // bge-m3 uses cosine similarity. faiss-node returns distance.
            // We need to get results with scores.
            const resultsWithScores = await this.vectorStore.similaritySearchWithScore(query, k * 2);
            
            // Filter by threshold and deduplicate
            return resultsWithScores
                .filter(([_, score]) => score >= threshold)
                .map(([doc, _]) => doc)
                .slice(0, k);
        } catch (error) {
            return [];
        }
    }

    async addExchange(userMsg: string, assistantMsg: string, metadata: Record<string, any>) {
        const content = `USER: ${userMsg}\nASSISTANT: ${assistantMsg}`;
        await this.addMessage(content, metadata);
    }

    async getRelevantContext(query: string, k: number = 10): Promise<string> {
        const docs = await this.search(query, k);
        if (docs.length === 0) return "";
        
        return docs.map(doc => {
            const timestamp = doc.metadata.timestamp ? new Date(doc.metadata.timestamp).toLocaleString() : 'Unknown Time';
            const role = doc.metadata.role ? doc.metadata.role.toUpperCase() : 'UNKNOWN';
            return `[${timestamp}] ${role}: ${doc.pageContent}`;
        }).join("\n---\n");
    }

    private async similaritySearch(query: string, k: number) {
        if (!this.vectorStore) return [];
        return await this.vectorStore.similaritySearch(query, k);
    }
}

export const vectorMemory = new VectorMemory();
