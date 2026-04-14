/**
 * Quote Tool: fetches real-time quote data for a single stock symbol.
 */

import YahooFinance from "yahoo-finance2";
import type { Tool } from "./types.js";

const yf = new YahooFinance();

export interface QuoteInput {
  symbol: string;
}

export interface QuoteOutput {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketCap: number | null;
  peRatio: number | null;
  high52w: number | null;
  low52w: number | null;
  volume: number | null;
  currency: string | null;
}

export const quoteTool: Tool<QuoteInput, QuoteOutput> = {
  name: "get_quote",
  description:
    "Get real-time quote for a single stock symbol. Returns current price, daily change %, day high/low, 52-week range, market cap, P/E ratio, and volume. Use this first when asked about current price or today's performance.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Stock ticker symbol (e.g. AAPL, TSLA, NOK).",
      },
    },
    required: ["symbol"],
  },

  async execute(input: QuoteInput): Promise<QuoteOutput> {
    const symbol = input.symbol.toUpperCase().trim();
    try {
      const q = await yf.quote(symbol, {}, { validateResult: false });
      return {
        symbol: q.symbol ?? symbol,
        name: q.shortName ?? q.longName ?? symbol,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        open: q.regularMarketOpen ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        dayHigh: q.regularMarketDayHigh ?? null,
        dayLow: q.regularMarketDayLow ?? null,
        marketCap: q.marketCap ?? null,
        peRatio: q.trailingPE ?? null,
        high52w: q.fiftyTwoWeekHigh ?? null,
        low52w: q.fiftyTwoWeekLow ?? null,
        volume: q.regularMarketVolume ?? null,
        currency: q.currency ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Quote fetch failed for "${symbol}": ${message}`);
    }
  },
};

