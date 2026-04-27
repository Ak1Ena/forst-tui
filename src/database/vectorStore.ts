import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Document } from "@langchain/core/documents";
import path from "path";
import fs from "fs";
import { GLOBAL_DIR } from "../core/ConfigManager.js";

const VECTOR_STORE_PATH = path.join(GLOBAL_DIR, 'vector_store');

export class VectorMemory {
    private vectorStore: FaissStore | null = null;
    private embeddings: GoogleGenerativeAIEmbeddings | null = null;
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        if (apiKey && apiKey !== 'mock-key') {
            this.embeddings = new GoogleGenerativeAIEmbeddings({
                apiKey: apiKey,
                modelName: "embedding-001",
            });
        }
    }

    async init() {
        if (!this.embeddings) return;
        if (fs.existsSync(VECTOR_STORE_PATH)) {
            this.vectorStore = await FaissStore.load(VECTOR_STORE_PATH, this.embeddings);
        }
    }

    async addMessage(content: string, metadata: Record<string, any>) {
        if (!this.embeddings) return;
        const doc = new Document({ pageContent: content, metadata });
        
        if (!this.vectorStore) {
            this.vectorStore = await FaissStore.fromDocuments([doc], this.embeddings);
        } else {
            await this.vectorStore.addDocuments([doc]);
        }
        
        await this.vectorStore.save(VECTOR_STORE_PATH);
    }

    async search(query: string, k: number = 4) {
        if (!this.vectorStore) return [];
        return await this.vectorStore.similaritySearch(query, k);
    }
}
