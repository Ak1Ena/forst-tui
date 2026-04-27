/**
 * ToolRetriever — Static TF-IDF semantic search over tool descriptions.
 *
 * No embeddings API needed. At startup, builds a TF-IDF index from every
 * registered tool's name + description. On each agent turn, scores the user
 * query against that index and returns the top-K most relevant tools.
 *
 * Fallback behaviour (when score < threshold or index empty):
 *   → Returns no full tool schemas, but provides a lightweight "tool catalog"
 *     string that the model can read to understand what tools exist.
 *     This lets the model ask for a tool by name in a follow-up without paying
 *     the full schema token cost on every message.
 */

export interface ToolEntry {
    name: string;
    description: string;
    tool: any; // LangChain DynamicTool / DynamicStructuredTool
}

// ---------- TF-IDF helpers ----------

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9_\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 1);
}

function buildTF(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [k, v] of tf) tf.set(k, v / tokens.length);
    return tf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0, normA = 0, normB = 0;
    for (const [k, v] of a) {
        dot += v * (b.get(k) ?? 0);
        normA += v * v;
    }
    for (const v of b.values()) normB += v * v;
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------- ToolRetriever ----------

export class ToolRetriever {
    private entries: ToolEntry[] = [];
    private tfVectors: Map<string, number>[] = [];
    // IDF weights across the corpus
    private idf: Map<string, number> = new Map();

    /**
     * Build the index from a list of LangChain tools.
     * Call once at startup after getTools().
     */
    build(tools: any[]) {
        this.entries = tools.map(t => ({
            name: t.name as string,
            description: t.description as string,
            tool: t,
        }));

        // Build raw TF vectors first
        const rawTFs = this.entries.map(e =>
            buildTF(tokenize(`${e.name} ${e.description}`))
        );

        // Compute IDF: log(N / df) for each term
        const df = new Map<string, number>();
        for (const tf of rawTFs) {
            for (const k of tf.keys()) df.set(k, (df.get(k) ?? 0) + 1);
        }
        const N = this.entries.length;
        this.idf = new Map(
            [...df.entries()].map(([k, v]) => [k, Math.log(N / v + 1)])
        );

        // Apply IDF to get TF-IDF vectors
        this.tfVectors = rawTFs.map(tf => {
            const tfidf = new Map<string, number>();
            for (const [k, v] of tf) tfidf.set(k, v * (this.idf.get(k) ?? 1));
            return tfidf;
        });
    }

    /**
     * Search the tool index and return the top-K most relevant tools.
     *
     * @param query     User message or task description
     * @param topK      Max tools to return (default 3)
     * @param threshold Min cosine similarity to include (default 0.12)
     */
    search(query: string, topK = 3, threshold = 0.12): ToolEntry[] {
        if (this.entries.length === 0) return [];

        const queryRawTF = buildTF(tokenize(query));
        // Apply corpus IDF to query vector
        const queryVec = new Map<string, number>();
        for (const [k, v] of queryRawTF) {
            queryVec.set(k, v * (this.idf.get(k) ?? 1));
        }

        const scored = this.tfVectors
            .map((vec, i) => ({ entry: this.entries[i], score: cosineSimilarity(queryVec, vec) }))
            .filter(r => r.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        return scored.map(r => r.entry);
    }

    /**
     * Returns a compact one-line catalog of all tool names + short descriptions.
     * Used as the fallback when no tools are retrieved — the model can read this
     * and decide if it wants to ask for a specific tool in a follow-up.
     *
     * Keeps token cost very low (~30-50 tokens for 8 tools).
     */
    getCatalog(): string {
        if (this.entries.length === 0) return '';
        const lines = this.entries.map(e => `- ${e.name}: ${e.description.split('.')[0]}`);
        return `[AVAILABLE TOOLS]\n${lines.join('\n')}`;
    }

    /** All registered tool entries (for forced inclusion). */
    getAll(): ToolEntry[] {
        return this.entries;
    }
}

// Singleton — built once when the tools registry is first loaded
export const toolRetriever = new ToolRetriever();
