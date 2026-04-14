/**
 * Stock Screener Tool: uses yahoo-finance2 predefined screeners
 * and filters results by sector, market cap, P/E ratio, and volume.
 */

import YahooFinance from "yahoo-finance2";
import type { Tool } from "./types.js";

const yf = new YahooFinance();

export interface ScreenerInput {
  sector?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minPE?: number;
  maxPE?: number;
  minVolume?: number;
  limit?: number;
}

export interface ScreenerOutputItem {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number | null;
  peRatio: number | null;
  volume: number | null;
  price: number;
}

export const screenerTool: Tool<ScreenerInput, ScreenerOutputItem[]> = {
  name: "stock_screener",
  description:
    "Screen and filter stocks by sector, market cap range, P/E ratio, and minimum volume. Returns matching stocks with key financial metrics.",
  inputSchema: {
    type: "object",
    properties: {
      sector: {
        type: "string",
        description:
          "Filter by sector name (e.g. 'Technology', 'Healthcare'). Case-insensitive partial match.",
      },
      minMarketCap: {
        type: "number",
        description: "Minimum market capitalization in USD.",
      },
      maxMarketCap: {
        type: "number",
        description: "Maximum market capitalization in USD.",
      },
      minPE: {
        type: "number",
        description: "Minimum trailing P/E ratio.",
      },
      maxPE: {
        type: "number",
        description: "Maximum trailing P/E ratio.",
      },
      minVolume: {
        type: "number",
        description: "Minimum daily trading volume.",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 20).",
      },
    },
  },

  async execute(input: ScreenerInput): Promise<ScreenerOutputItem[]> {
    const limit = input.limit ?? 20;

    try {
      // Fetch a broad set from the "most_actives" screener to get a good pool
      // validateResult: false — Yahoo Finance API occasionally returns fields
      // that don't match the library's strict schema; skip validation to avoid crashes.
      const result = await yf.screener(
        { scrIds: "most_actives", count: 100 },
        {},
        { validateResult: false },
      );

      let quotes = result.quotes;

      // Apply filters
      if (input.sector) {
        const sectorLower = input.sector.toLowerCase();
        quotes = quotes.filter((q) => {
          const sector = (q as unknown as { sector?: string }).sector;
          return sector && sector.toLowerCase().includes(sectorLower);
        });
      }

      if (input.minMarketCap != null) {
        quotes = quotes.filter(
          (q) => q.marketCap != null && q.marketCap >= input.minMarketCap!,
        );
      }
      if (input.maxMarketCap != null) {
        quotes = quotes.filter(
          (q) => q.marketCap != null && q.marketCap <= input.maxMarketCap!,
        );
      }

      if (input.minPE != null) {
        quotes = quotes.filter(
          (q) => q.trailingPE != null && q.trailingPE >= input.minPE!,
        );
      }
      if (input.maxPE != null) {
        quotes = quotes.filter(
          (q) => q.trailingPE != null && q.trailingPE <= input.maxPE!,
        );
      }

      if (input.minVolume != null) {
        quotes = quotes.filter(
          (q) =>
            q.regularMarketVolume != null &&
            q.regularMarketVolume >= input.minVolume!,
        );
      }

      return quotes.slice(0, limit).map((q) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        sector:
          (q as unknown as { sector?: string }).sector || "Unknown",
        marketCap: q.marketCap ?? null,
        peRatio: q.trailingPE ?? null,
        volume: q.regularMarketVolume ?? null,
        price: q.regularMarketPrice,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Stock screener failed: ${message}`);
    }
  },
};

