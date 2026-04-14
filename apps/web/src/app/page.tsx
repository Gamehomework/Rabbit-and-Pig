"use client";

import { useState } from "react";
import Link from "next/link";
import { screenStocks, type Stock, type StockScreenParams } from "@/lib/api";
import { formatCurrency } from "@rabbit-and-pig/shared";

const SECTORS = [
  "", "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
  "Industrials", "Communication Services", "Consumer Defensive", "Energy",
  "Utilities", "Real Estate", "Basic Materials",
];

export default function DiscoveryPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Filter state
  const [sector, setSector] = useState("");
  const [minMarketCap, setMinMarketCap] = useState("");
  const [maxMarketCap, setMaxMarketCap] = useState("");
  const [limit, setLimit] = useState("20");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const params: StockScreenParams = {};
      if (sector) params.sector = sector;
      if (minMarketCap) params.minMarketCap = Number(minMarketCap);
      if (maxMarketCap) params.maxMarketCap = Number(maxMarketCap);
      if (limit) params.limit = Number(limit);
      const result = await screenStocks(params);
      setStocks(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stocks");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Stock Discovery</h1>

      {/* Filter Form */}
      <form onSubmit={handleSearch} className="mb-8 rounded-lg border bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Sectors</option>
              {SECTORS.filter(Boolean).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Min Market Cap ($B)</label>
            <input
              type="number"
              value={minMarketCap}
              onChange={(e) => setMinMarketCap(e.target.value)}
              placeholder="e.g. 1"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Max Market Cap ($B)</label>
            <input
              type="number"
              value={maxMarketCap}
              onChange={(e) => setMaxMarketCap(e.target.value)}
              placeholder="e.g. 1000"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Limit</label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              min={1}
              max={100}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching…" : "Search Stocks"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Results */}
      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && searched && stocks.length === 0 && !error && (
        <p className="text-gray-500">No stocks found. Try adjusting your filters.</p>
      )}

      {stocks.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Sector</th>
                <th className="px-4 py-3 text-right">Market Cap</th>
                <th className="px-4 py-3 text-right">P/E</th>
                <th className="px-4 py-3 text-right">Div Yield</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stocks.map((stock) => (
                <tr key={stock.symbol} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/stocks/${stock.symbol}`} className="font-medium text-blue-600 hover:underline">
                      {stock.symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{stock.name}</td>
                  <td className="px-4 py-3 text-gray-600">{stock.sector ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {stock.marketCap != null ? formatCurrency(stock.marketCap) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {stock.peRatio != null ? stock.peRatio.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {stock.dividendYield != null ? `${(stock.dividendYield * 100).toFixed(2)}%` : "—"}
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

