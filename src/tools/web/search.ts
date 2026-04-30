import { Tool } from "@langchain/core/tools";
import { search, SafeSearchType } from "duck-duck-scrape";

/**
 * Custom DuckDuckGo search tool with retry logic.
 */
class DuckDuckGoSearch extends Tool {
    name = "duckduckgo-search";
    description = "A search engine. Useful for when you need to answer questions about current events. Input should be a search query.";
    maxResults = 5;

    constructor(params?: { maxResults?: number }) {
        super();
        this.maxResults = params?.maxResults ?? this.maxResults;
    }

    async _call(input: string) {
        let lastError: any;
        const maxRetries = 3;

        for (let i = 0; i < maxRetries; i++) {
            try {
                if (i > 0) {
                    const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                const { results } = await search(input, {
                    safeSearch: SafeSearchType.OFF,
                });

                if (!results || results.length === 0) {
                    return "No results found.";
                }

                return JSON.stringify(
                    results
                        .map((result) => ({
                            title: result.title,
                            link: result.url,
                            snippet: result.description,
                        }))
                        .slice(0, this.maxResults)
                );
            } catch (error: any) {
                lastError = error;
                const errorMessage = error?.message?.toLowerCase() || "";
                if (errorMessage.includes("anomaly") || errorMessage.includes("too many requests") || errorMessage.includes("429")) {
                    console.warn(`DuckDuckGo search rate limited (attempt ${i + 1}/${maxRetries}). Retrying...`);
                    continue;
                }
                throw error;
            }
        }

        return `Error: DuckDuckGo search failed after ${maxRetries} attempts due to rate limiting. Please try again later. (Original error: ${lastError?.message})`;
    }
}

export const searchTool = new DuckDuckGoSearch({ maxResults: 5 });
