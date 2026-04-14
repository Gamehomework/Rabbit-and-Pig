/**
 * News Tool: fetches recent news for a stock symbol via Yahoo Finance RSS.
 */

import type { Tool } from "./types.js";

export interface NewsInput {
  symbol: string;
  limit?: number;
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

export type NewsOutput = NewsArticle[];

/** Parse XML text to extract RSS items (lightweight, no dependency). */
function parseRssItems(xml: string): NewsArticle[] {
  const items: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? "";
    const url = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
    const source = block.match(/<source[^>]*>(.*?)<\/source>/)?.[1]
      ?? block.match(/<source[^>]*url="[^"]*">(.*?)<\/source>/)?.[1]
      ?? "Yahoo Finance";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

    if (title) {
      items.push({
        title,
        url,
        source,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : "",
      });
    }
  }

  return items;
}

export const newsTool: Tool<NewsInput, NewsOutput> = {
  name: "get_news",
  description:
    "Fetch recent news articles for a stock symbol. Returns headlines, URLs, sources, and publication dates.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Stock ticker symbol (e.g. TSLA, AAPL).",
      },
      limit: {
        type: "number",
        description: "Maximum number of articles to return (default 5).",
      },
    },
    required: ["symbol"],
  },

  async execute(input: NewsInput): Promise<NewsOutput> {
    const { symbol, limit = 5 } = input;
    const upperSymbol = symbol.toUpperCase().trim();

    if (!upperSymbol) {
      throw new Error("symbol is required");
    }

    const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(upperSymbol)}&region=US&lang=en-US`;

    try {
      const response = await fetch(rssUrl, {
        headers: { "User-Agent": "RabbitAndPig/1.0" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Yahoo RSS returned HTTP ${response.status}`);
      }

      const xml = await response.text();
      const articles = parseRssItems(xml);

      return articles.slice(0, limit);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Return empty array with a descriptive error rather than throwing,
      // so the agent loop can handle it gracefully.
      console.error(`[news] Failed to fetch news for ${upperSymbol}: ${message}`);
      return [];
    }
  },
};

