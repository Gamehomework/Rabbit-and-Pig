/**
 * Stock Context Loader: pre-fetches quote, 30-day chart summary, and news headlines
 * for a stock and returns a formatted context block to inject into the LLM system prompt.
 *
 * This implements "Context Pre-loading" (Option A):
 * data is fetched in parallel before the LLM call, so the model has immediate
 * awareness without burning tool-call iterations on basic data.
 */

import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

const NEWS_RSS = (symbol: string) =>
  `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;

function parseNewsHeadlines(xml: string, limit: number): string[] {
  const headlines: string[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null && headlines.length < limit) {
    const block = match[1];
    const title =
      block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
      block.match(/<title>(.*?)<\/title>/)?.[1] ??
      "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
    const source =
      block.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? "Yahoo Finance";
    if (title) {
      const date = pubDate ? new Date(pubDate).toLocaleDateString() : "recent";
      headlines.push(`• [${date}] ${title} — ${source}`);
    }
  }
  return headlines;
}

/**
 * Build a structured context block for a stock symbol.
 * Returns an empty string if all fetches fail (agent falls back to tool calls).
 */
export async function buildStockContext(symbol: string): Promise<string> {
  const upper = symbol.toUpperCase().trim();

  const [quoteResult, chartResult, newsResult] = await Promise.allSettled([
    yf.quote(upper, {}, { validateResult: false }),
    yf.chart(
      upper,
      { period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), interval: "1d" },
      { validateResult: false },
    ),
    fetch(NEWS_RSS(upper), {
      headers: { "User-Agent": "RabbitAndPig/1.0" },
      signal: AbortSignal.timeout(8_000),
    }).then((r) => (r.ok ? r.text() : "")),
  ]);

  const lines: string[] = [
    `=== Pre-loaded Market Data for ${upper} (${new Date().toISOString()}) ===`,
    `Use this data directly. Only call tools if the user needs deeper or different analysis.`,
  ];

  // ── Quote ──
  if (quoteResult.status === "fulfilled") {
    const q = quoteResult.value;
    const dir = (q.regularMarketChangePercent ?? 0) >= 0 ? "▲" : "▼";
    lines.push(
      `\n[Current Quote]`,
      `Name: ${q.shortName ?? q.longName ?? upper}`,
      `Price: ${q.regularMarketPrice?.toFixed(2) ?? "N/A"} ${q.currency ?? ""}  ${dir} ${q.regularMarketChange?.toFixed(2) ?? "N/A"} (${q.regularMarketChangePercent?.toFixed(2) ?? "N/A"}%) today`,
      `Day Range: ${q.regularMarketDayLow?.toFixed(2) ?? "N/A"} – ${q.regularMarketDayHigh?.toFixed(2) ?? "N/A"}`,
      `52-Week Range: ${q.fiftyTwoWeekLow?.toFixed(2) ?? "N/A"} – ${q.fiftyTwoWeekHigh?.toFixed(2) ?? "N/A"}`,
      `Market Cap: ${q.marketCap ? `$${(q.marketCap / 1e9).toFixed(1)}B` : "N/A"}`,
      `P/E (trailing): ${q.trailingPE?.toFixed(2) ?? "N/A"}`,
      `Volume: ${q.regularMarketVolume?.toLocaleString() ?? "N/A"}`,
    );
  }

  // ── 30-day chart summary ──
  if (chartResult.status === "fulfilled") {
    const chartData = chartResult.value as { quotes: Array<{ date: Date; close?: number | null; high?: number | null; low?: number | null; volume?: number | null }> };
    const quotes = chartData.quotes.filter((q) => q.close != null);
    if (quotes.length >= 2) {
      const first = quotes[0];
      const last = quotes[quotes.length - 1];
      const pct = (((last.close! - first.close!) / first.close!) * 100).toFixed(2);
      const high30 = Math.max(...quotes.map((q) => q.high ?? 0)).toFixed(2);
      const low30 = Math.min(...quotes.filter((q) => q.low != null).map((q) => q.low!)).toFixed(2);
      const avgVol = Math.round(
        quotes.reduce((s, q) => s + (q.volume ?? 0), 0) / quotes.length,
      );
      lines.push(
        `\n[30-Day Price History Summary]`,
        `Period: ${first.date.toISOString().split("T")[0]} → ${last.date.toISOString().split("T")[0]}`,
        `30-Day Change: ${pct}%  (${first.close?.toFixed(2)} → ${last.close?.toFixed(2)})`,
        `30-Day High: ${high30}  |  30-Day Low: ${low30}`,
        `Avg Daily Volume: ${avgVol.toLocaleString()}`,
      );
    }
  }

  // ── News headlines ──
  if (newsResult.status === "fulfilled" && newsResult.value) {
    const headlines = parseNewsHeadlines(newsResult.value as string, 5);
    if (headlines.length > 0) {
      lines.push(`\n[Recent News Headlines]`, ...headlines);
    }
  }

  lines.push(`\n=== End of Pre-loaded Data ===`);
  return lines.join("\n");
}

