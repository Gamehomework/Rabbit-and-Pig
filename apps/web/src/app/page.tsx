"use client";

import { useState } from "react";
import Link from "next/link";
import { screenStocks, searchStocks, type Stock, type StockScreenParams, type SearchResult } from "@/lib/api";
import { formatCurrency } from "@rabbit-and-pig/shared";

const SECTORS = [
  "", "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
  "Industrials", "Communication Services", "Consumer Defensive", "Energy",
  "Utilities", "Real Estate", "Basic Materials",
];

export default function DiscoveryPage() {
  // Search mode
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Screener mode
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [sector, setSector] = useState("");
  const [minMarketCap, setMinMarketCap] = useState("");
  const [maxMarketCap, setMaxMarketCap] = useState("");
  const [limit, setLimit] = useState("20");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [mode, setMode] = useState<"search" | "screen">("screen");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      // Search mode
      setMode("search");
      setLoading(true);
      setError(null);
      setSearched(true);
      try {
        setSearchResults(await searchStocks(q));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    } else {
      // Screener mode
      setMode("screen");
      setLoading(true);
      setError(null);
      setSearched(true);
      try {
        const params: StockScreenParams = {};
        if (sector) params.sector = sector;
        if (minMarketCap) params.minMarketCap = Number(minMarketCap) * 1e9;
        if (maxMarketCap) params.maxMarketCap = Number(maxMarketCap) * 1e9;
        if (limit) params.limit = Number(limit);
        setStocks(await screenStocks(params));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch stocks");
      } finally {
        setLoading(false);
      }
    }
  }

  function handleClearSearch() {
    setSearchQuery("");
    setSearchResults([]);
    setMode("screen");
    setSearched(false);
    setError(null);
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Stock Discovery</h1>

      {/* ── Search bar ── */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-gray-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or symbol (e.g. Nokia, AAPL)…"
            className="w-full rounded border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "…" : "Search"}
        </button>
        {mode === "search" && (
          <button type="button" onClick={handleClearSearch}
            className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            Clear
          </button>
        )}
      </form>

      {/* ── Screener filters (hidden in search mode) ── */}
      {mode === "screen" && (
        <div className="rounded border bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-600">Sector</label>
              <select value={sector} onChange={(e) => setSector(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none">
                <option value="">All Sectors</option>
                {SECTORS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-600">Min Cap ($B)</label>
              <input type="number" value={minMarketCap} onChange={(e) => setMinMarketCap(e.target.value)}
                placeholder="e.g. 1"
                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-600">Max Cap ($B)</label>
              <input type="number" value={maxMarketCap} onChange={(e) => setMaxMarketCap(e.target.value)}
                placeholder="e.g. 1000"
                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-600">Limit</label>
              <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)}
                min={1} max={100}
                className="w-16 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none" />
            </div>
            <button type="button" onClick={handleSearch as unknown as React.MouseEventHandler}
              disabled={loading}
              className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              Screen
            </button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {/* ── Empty state ── */}
      {!loading && searched && !error && mode === "search" && searchResults.length === 0 && (
        <p className="text-sm text-gray-500">No results for "{searchQuery}".</p>
      )}
      {!loading && searched && !error && mode === "screen" && stocks.length === 0 && (
        <p className="text-sm text-gray-500">No stocks found. Try adjusting filters.</p>
      )}

      {/* ── Search results table ── */}
      {mode === "search" && searchResults.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Exchange</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {searchResults.map((r) => (
                <tr key={r.symbol} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-1.5">
                    <Link href={`/stocks/${r.symbol}`} className="font-medium text-blue-600 hover:underline">
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">{r.name}</td>
                  <td className="px-3 py-1.5 text-gray-500 text-xs">{r.exchange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Screener results table ── */}
      {mode === "screen" && stocks.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Sector</th>
                <th className="px-3 py-2 text-right">Market Cap</th>
                <th className="px-3 py-2 text-right">P/E</th>
                <th className="px-3 py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stocks.map((stock) => (
                <tr key={stock.symbol} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-1.5">
                    <Link href={`/stocks/${stock.symbol}`} className="font-medium text-blue-600 hover:underline">
                      {stock.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">{stock.name}</td>
                  <td className="px-3 py-1.5 text-gray-500 text-xs">{stock.sector ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right text-xs">
                    {stock.marketCap != null ? formatCurrency(stock.marketCap) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs">
                    {stock.peRatio != null ? stock.peRatio.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium">
                    {stock.price != null ? `$${stock.price.toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

