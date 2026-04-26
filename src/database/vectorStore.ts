import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Document } from "@langchain/core/documents";
import path from "path";
import fs from "fs";

const VECTOR_STORE_PATH = path.join(process.cwd(), 'data', 'vector_store');

export class VectorMemory {
    private vectorStore: HNSWLib | null = null;
    private embeddings: GoogleGenerativeAIEmbeddings;

    constructor(apiKey: string) {
        this.embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey: apiKey,
            modelName: "embedding-001",
        });
    }

    async init() {
        if (fs.existsSync(VECTOR_STORE_PATH)) {
            this.vectorStore = await HNSWLib.load(VECTOR_STORE_PATH, this.embeddings);
        } else {
            // Initialize empty if doesn't exist
            // HNSWLib requires at least one document to save, so we'll do that on first addition
        }
    }

    async addMessage(content: string, metadata: Record<string, any>) {
        const doc = new Document({ pageContent: content, metadata });
        
        if (!this.vectorStore) {
            this.vectorStore = await HNSWLib.fromDocuments([doc], this.embeddings);
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
