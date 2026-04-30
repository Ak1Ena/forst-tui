import { Tool } from "@langchain/core/tools";

/**
 * A stable tool using the official DuckDuckGo Instant Answer API.
 * Specifically designed for fast fact-lookup, summaries, and official links.
 */
class FactLookupTool extends Tool {
    name = "fact-lookup";
    description = "A fact-finding tool. Use this to get concise summaries, definitions, and official links for well-known topics, entities, people, or products. It provides verified facts rather than general web search results.";

    async _call(input: string) {
        try {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(input)}&format=json&no_html=1`;
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
                }
            });

            if (!response.ok) {
                return `Error: DuckDuckGo API returned status ${response.status}`;
            }

            const data = (await response.json()) as any;
            const results: any[] = [];

            // 1. Direct Abstract
            if (data.AbstractText) {
                results.push({
                    title: data.Heading || input,
                    link: data.AbstractURL,
                    snippet: data.AbstractText
                });
            }

            // 2. Related Topics (can be deep)
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                for (const topic of data.RelatedTopics) {
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: input,
                            link: topic.FirstURL,
                            snippet: topic.Text
                        });
                    } else if (topic.Topics && Array.isArray(topic.Topics)) {
                        // Handle nested categories
                        for (const subTopic of topic.Topics) {
                            if (subTopic.Text && subTopic.FirstURL) {
                                results.push({
                                    title: input,
                                    link: subTopic.FirstURL,
                                    snippet: subTopic.Text
                                });
                            }
                        }
                    }
                    if (results.length >= 5) break;
                }
            }

            if (results.length > 0) {
                return JSON.stringify(results.slice(0, 5));
            }

            return "No instant answer found. The official DuckDuckGo API is limited to general topics. For deep web searching, please use a different tool or try a more specific entity name.";
        } catch (error: any) {
            return `Error connecting to DuckDuckGo API: ${error.message}`;
        }
    }
}

export const factLookupTool = new FactLookupTool();
