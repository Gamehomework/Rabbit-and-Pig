"use client";

import { useState } from "react";
import {
  runBacktest,
  type BacktestParams,
  type BacktestResult,
  type BacktestStats,
  type BacktestTrade,
} from "@/lib/api";
import type { ChartMarker } from "@/components/TradingViewChart";

type Strategy = BacktestParams["strategy"];
type Range = NonNullable<BacktestParams["range"]>;

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: "ma_crossover", label: "MA Crossover" },
  { value: "rsi", label: "RSI" },
  { value: "bollinger_breakout", label: "Bollinger Breakout" },
];

const RANGES: { value: Range; label: string }[] = [
  { value: "1y", label: "1Y" },
  { value: "2y", label: "2Y" },
  { value: "3y", label: "3Y" },
];

interface BacktestPanelProps {
  symbol: string;
  /** Externally-set result (e.g. from AI command) */
  externalResult?: BacktestResult | null;
  /** Whether the panel should be open */
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  onMarkersChange?: (markers: ChartMarker[]) => void;
  onClear?: () => void;
}

export default function BacktestPanel({
  symbol,
  externalResult,
  isOpen: controlledOpen,
  onToggle,
  onMarkersChange,
  onClear,
}: BacktestPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onToggle?.(v);
  };

  const [strategy, setStrategy] = useState<Strategy>("ma_crossover");
  const [range, setRange] = useState<Range>("1y");
  const [initialCapital, setInitialCapital] = useState(10000);
  // MA params
  const [fastPeriod, setFastPeriod] = useState(10);
  const [slowPeriod, setSlowPeriod] = useState(30);
  // RSI params
  const [overbought, setOverbought] = useState(70);
  const [oversold, setOversold] = useState(30);
  // Bollinger params
  const [bbPeriod, setBbPeriod] = useState(20);
  const [bbStdDev, setBbStdDev] = useState(2);

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayResult = externalResult ?? result;

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const params: BacktestParams = { strategy, range, initialCapital };
      if (strategy === "ma_crossover") {
        params.fastPeriod = fastPeriod;
        params.slowPeriod = slowPeriod;
      } else if (strategy === "rsi") {
        params.overbought = overbought;
        params.oversold = oversold;
      } else if (strategy === "bollinger_breakout") {
        params.bbPeriod = bbPeriod;
        params.bbStdDev = bbStdDev;
      }
      const res = await runBacktest(symbol, params);
      setResult(res);
      onMarkersChange?.(res.markers as ChartMarker[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setResult(null);
    setError(null);
    onMarkersChange?.([]);
    onClear?.();
  }

  return (
    <section className="rounded-lg border bg-white shadow-sm">
      {/* Header / Toggle */}
      <button
        onClick={() => setOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-lg font-semibold flex items-center gap-2">
          📊 Backtest
          {displayResult && (
            <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded">
              {displayResult.stats.totalReturn > 0 ? "+" : ""}{displayResult.stats.totalReturn}%
            </span>
          )}
        </h2>
        <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* Controls row */}
          <div className="flex flex-wrap items-end gap-3">
            {/* Strategy */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Strategy</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as Strategy)}
                className="rounded border px-2 py-1.5 text-sm"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Range */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Period</label>
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRange(r.value)}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      range === r.value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Strategy-specific params */}
            {strategy === "ma_crossover" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fast MA</label>
                  <input type="number" value={fastPeriod} onChange={(e) => setFastPeriod(Number(e.target.value))}
                    className="w-20 rounded border px-2 py-1.5 text-sm" min={2} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Slow MA</label>
                  <input type="number" value={slowPeriod} onChange={(e) => setSlowPeriod(Number(e.target.value))}
                    className="w-20 rounded border px-2 py-1.5 text-sm" min={2} />
                </div>
              </>
            )}
            {strategy === "rsi" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Overbought</label>
                  <input type="number" value={overbought} onChange={(e) => setOverbought(Number(e.target.value))}
                    className="w-20 rounded border px-2 py-1.5 text-sm" min={50} max={100} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Oversold</label>
                  <input type="number" value={oversold} onChange={(e) => setOversold(Number(e.target.value))}
                    className="w-20 rounded border px-2 py-1.5 text-sm" min={0} max={50} />
                </div>
              </>
            )}
            {strategy === "bollinger_breakout" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">BB Period</label>
                  <input type="number" value={bbPeriod} onChange={(e) => setBbPeriod(Number(e.target.value))}
                    className="w-20 rounded border px-2 py-1.5 text-sm" min={2} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Std Dev</label>
                  <input type="number" value={bbStdDev} onChange={(e) => setBbStdDev(Number(e.target.value))}
                    className="w-20 rounded border px-2 py-1.5 text-sm" min={0.5} max={5} step={0.5} />
                </div>
              </>
            )}

            {/* Initial Capital */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Capital ($)</label>
              <input type="number" value={initialCapital} onChange={(e) => setInitialCapital(Number(e.target.value))}
                className="w-28 rounded border px-2 py-1.5 text-sm" min={100} step={1000} />
            </div>

            {/* Buttons */}
            <button
              onClick={handleRun}
              disabled={loading}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Running…" : "Run Backtest"}
            </button>
            {displayResult && (
              <button
                onClick={handleClear}
                className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Results */}
          {displayResult && <BacktestResults stats={displayResult.stats} trades={displayResult.trades} />}
        </div>
      )}
    </section>
  );
}

/* ── Stats + Trades sub-component ─────────────────────────────────── */

function BacktestResults({ stats, trades }: { stats: BacktestStats; trades: BacktestTrade[] }) {
  const [showTrades, setShowTrades] = useState(false);

  return (
    <div className="space-y-3">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Total Return" value={`${stats.totalReturn > 0 ? "+" : ""}${stats.totalReturn}%`}
          color={stats.totalReturn >= 0 ? "text-green-600" : "text-red-600"} />
        <StatCard label="Win Rate" value={`${stats.winRate}%`}
          color={stats.winRate >= 50 ? "text-green-600" : "text-amber-600"} />
        <StatCard label="Max Drawdown" value={`${stats.maxDrawdown}%`} color="text-red-600" />
        <StatCard label="Sharpe" value={stats.sharpeRatio.toFixed(2)}
          color={stats.sharpeRatio >= 1 ? "text-green-600" : "text-gray-700"} />
        <StatCard label="Trades" value={String(stats.totalTrades)} color="text-gray-700" />
      </div>

      {/* Trades table toggle */}
      <button
        onClick={() => setShowTrades(!showTrades)}
        className="text-xs font-medium text-blue-600 hover:underline"
      >
        {showTrades ? "Hide" : "Show"} trade history ({trades.length} trades)
      </button>

      {showTrades && trades.length > 0 && (
        <div className="max-h-60 overflow-auto rounded border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left font-medium text-gray-500">Date</th>
                <th className="px-2 py-1 text-left font-medium text-gray-500">Action</th>
                <th className="px-2 py-1 text-right font-medium text-gray-500">Price</th>
                <th className="px-2 py-1 text-right font-medium text-gray-500">Shares</th>
                <th className="px-2 py-1 text-right font-medium text-gray-500">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {trades.map((t, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-2 py-1 text-gray-700">{t.date.slice(0, 10)}</td>
                  <td className={`px-2 py-1 font-medium ${t.action === "BUY" ? "text-green-600" : "text-red-600"}`}>
                    {t.action}
                  </td>
                  <td className="px-2 py-1 text-right text-gray-700">${t.price.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{t.shares}</td>
                  <td className={`px-2 py-1 text-right font-medium ${t.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {t.action === "SELL" ? `$${t.pnl.toFixed(2)}` : "—"}
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

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-2 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

