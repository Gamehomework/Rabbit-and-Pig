/**
 * Sample sentiment analysis plugin.
 * Exports a PluginDefinition with a mock sentiment_analyzer tool.
 */

import type { PluginDefinition } from "../../src/plugins/types.js";
import type { Tool } from "../../src/agent/tools/types.js";

interface SentimentInput {
  symbol: string;
}

interface SentimentOutput {
  symbol: string;
  sentiment: "bullish" | "bearish" | "neutral";
  score: number;
  summary: string;
}

/** Simple hash function to generate deterministic "random" results from a symbol. */
function hashSymbol(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const sentimentAnalyzerTool: Tool<SentimentInput, SentimentOutput> = {
  name: "sentiment_analyzer",
  description:
    "Analyze market sentiment for a given stock symbol. Returns a sentiment label (bullish/bearish/neutral), a numeric score, and a summary.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Stock ticker symbol to analyze sentiment for (e.g. AAPL, TSLA).",
      },
    },
    required: ["symbol"],
  },
  async execute(input: SentimentInput): Promise<SentimentOutput> {
    const hash = hashSymbol(input.symbol.toUpperCase());
    const mod = hash % 3;
    const sentiments: Array<"bullish" | "bearish" | "neutral"> = ["bullish", "bearish", "neutral"];
    const sentiment = sentiments[mod]!;

    // Generate a score between -1 and 1
    const raw = ((hash % 200) - 100) / 100;
    const score = Math.round(raw * 100) / 100;

    const summaries: Record<string, string> = {
      bullish: `Market sentiment for ${input.symbol} is positive. Social media and analyst reports indicate optimism.`,
      bearish: `Market sentiment for ${input.symbol} is negative. Recent news suggests caution among investors.`,
      neutral: `Market sentiment for ${input.symbol} is mixed. No strong directional bias detected.`,
    };

    return {
      symbol: input.symbol.toUpperCase(),
      sentiment,
      score,
      summary: summaries[sentiment]!,
    };
  },
};

const plugin: PluginDefinition = {
  meta: {
    name: "sentiment_tool",
    description: "Provides market sentiment analysis for stock symbols.",
    version: "1.0.0",
    source: "local",
    sourceUri: "./plugins/sentiment",
  },
  tools: [sentimentAnalyzerTool],
};

export default plugin;

