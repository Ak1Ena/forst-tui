import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { Embeddings } from "@langchain/core/embeddings";
import { Document } from "@langchain/core/documents";
import path from "path";
import fs from "fs";
import { GLOBAL_DIR, configManager } from "../core/ConfigManager.js";
import { env } from "@huggingface/transformers";

// Prevent FAISS from crashing due to threading issues in some environments
process.env.OMP_NUM_THREADS = "1";

const LOCAL_MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export class VectorMemory {
    private vectorStore: FaissStore | null = null;
    private embeddings: Embeddings | null = null;
    private initPromise: Promise<void> | null = null;

    constructor() {}

    async init() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._init();
        return this.initPromise;
    }

    private async _init() {
        const settings = configManager.getSettings();
        const mode = settings.embeddingMode;

        if (mode === 'none') {
            this.embeddings = null;
            this.vectorStore = null;
            return;
        }

        if (mode === 'local') {
            this.embeddings = new HuggingFaceTransformersEmbeddings({
                model: LOCAL_MODEL_ID,
            });
        } else if (mode === 'cloud') {
            const provider = configManager.getActiveProvider();
            if (provider) {
                if (provider.type === 'openai') {
                    this.embeddings = new OpenAIEmbeddings({
                        openAIApiKey: provider.apiKey,
                        configuration: { baseURL: provider.baseUrl },
                        modelName: "text-embedding-3-small"
                    });
                } else if (provider.type === 'gemini') {
                    this.embeddings = new GoogleGenerativeAIEmbeddings({
                        apiKey: provider.apiKey,
                        modelName: "embedding-001"
                    });
                } else if (provider.type === 'ollama') {
                    this.embeddings = new OllamaEmbeddings({
                        baseUrl: provider.baseUrl || "http://localhost:11434",
                        model: provider.model
                    });
                }
            }
        }

        if (!this.embeddings) return;

        // Using a mode-specific path so we don't try to load incompatible indexes
        const storePath = path.join(GLOBAL_DIR, `vector_store_${mode}`);
        
        // Ensure the directory exists
        if (!fs.existsSync(storePath)) {
            fs.mkdirSync(storePath, { recursive: true });
        }

        const indexPath = path.join(storePath, 'faiss.index');
        if (fs.existsSync(indexPath)) {
            try {
                this.vectorStore = await FaissStore.load(storePath, this.embeddings);
            } catch (error) {
                this.vectorStore = null;
            }
        }
    }

    async checkLocalModelExists(): Promise<boolean> {
        // transformers.js uses a default cache directory. 
        // We can check if the model folder exists there.
        const cacheDir = env.cacheDir;
        const modelPath = path.join(cacheDir, LOCAL_MODEL_ID.replace('/', '--'));
        return fs.existsSync(modelPath);
    }

    async deleteLocalModel() {
        const cacheDir = env.cacheDir;
        const modelId = LOCAL_MODEL_ID;
        
        // Try both folder structures: "Xenova/model" and "Xenova--model"
        const pathsToTry = [
            path.join(cacheDir, modelId),
            path.join(cacheDir, modelId.replace('/', '--'))
        ];

        for (const modelPath of pathsToTry) {
            if (fs.existsSync(modelPath)) {
                fs.rmSync(modelPath, { recursive: true, force: true });
            }
        }
    }

    async downloadLocalModel(onProgress?: (progress: any) => void) {
        const { pipeline } = await import('@huggingface/transformers');
        await pipeline('feature-extraction', LOCAL_MODEL_ID, {
            progress_callback: onProgress
        });
    }

    async addMessage(content: string, metadata: Record<string, any>) {
        const settings = configManager.getSettings();
        if (settings.embeddingMode === 'none') return;

        await this.init();
        if (!this.embeddings || !content || content.trim().length === 0) return;
        
        const doc = new Document({ pageContent: content, metadata });
        
        try {
            if (!this.vectorStore) {
                this.vectorStore = await FaissStore.fromDocuments([doc], this.embeddings);
            } else {
                await this.vectorStore.addDocuments([doc]);
            }
            
            const storePath = path.join(GLOBAL_DIR, `vector_store_${settings.embeddingMode}`);
            await this.vectorStore.save(storePath);
        } catch (error) {
            console.error('VectorMemory addMessage error:', error);
        }
    }

    async search(query: string, k: number = 4, threshold: number = 0.5) {
        const settings = configManager.getSettings();
        if (settings.embeddingMode === 'none') return [];

        await this.init();
        if (!this.vectorStore || !query) return [];
        try {
            const resultsWithScores = await this.vectorStore.similaritySearchWithScore(query, k * 2);
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
}

export const vectorMemory = new VectorMemory();
