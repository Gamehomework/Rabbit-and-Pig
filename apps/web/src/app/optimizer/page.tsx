"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getPerformanceTrends, analyzePrompt, getToolRecommendations,
  getPersonalization, savePersonalization,
  type PerformanceMetric, type PromptSuggestion,
  type ToolRecommendation, type UserPreferences,
} from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";

// Available tools for toggles
const AVAILABLE_TOOLS = [
  "getStockPrice", "getStockChart", "getStockNews", "screenStocks",
  "searchStocks", "calculateMetrics", "getFinancials",
];

type SortField = "score" | "frequency" | "successRate";

export default function OptimizerPage() {
  // Performance
  const [days, setDays] = useState(30);
  const [perfData, setPerfData] = useState<PerformanceMetric[]>([]);
  const [perfLoading, setPerfLoading] = useState(true);

  // Prompt analysis
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Tool recommendations
  const [tools, setTools] = useState<ToolRecommendation[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("score");

  // Personalization
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [newStock, setNewStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  // Local edits
  const [watchedStocks, setWatchedStocks] = useState<string[]>([]);
  const [preferredTools, setPreferredTools] = useState<string[]>([]);

  const loadPerf = useCallback(async () => {
    setPerfLoading(true);
    try { setPerfData(await getPerformanceTrends(days)); }
    catch { /* empty */ }
    finally { setPerfLoading(false); }
  }, [days]);

  const loadTools = useCallback(async () => {
    setToolsLoading(true);
    try { setTools(await getToolRecommendations()); }
    catch { /* empty */ }
    finally { setToolsLoading(false); }
  }, []);

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const p = await getPersonalization();
      setPrefs(p);
      setWatchedStocks(p.watchedStocks ?? []);
      setPreferredTools(p.preferredTools ?? []);
    } catch { /* empty */ }
    finally { setPrefsLoading(false); }
  }, []);

  useEffect(() => { loadPerf(); }, [loadPerf]);
  useEffect(() => { loadTools(); loadPrefs(); }, [loadTools, loadPrefs]);

  async function handleAnalyze() {
    setAnalyzing(true); setAnalyzeError(null); setSuggestions([]);
    try { setSuggestions(await analyzePrompt()); }
    catch (err) { setAnalyzeError(err instanceof Error ? err.message : "Analysis failed"); }
    finally { setAnalyzing(false); }
  }

  async function handleSavePrefs() {
    setSaving(true); setToast(null);
    try {
      const p = await savePersonalization({ watchedStocks, preferredTools });
      setPrefs(p);
      setToast({ ok: true, text: "Preferences saved!" });
    } catch (err) {
      setToast({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally { setSaving(false); }
    setTimeout(() => setToast(null), 3000);
  }

  function addStock() {
    const s = newStock.trim().toUpperCase();
    if (s && !watchedStocks.includes(s)) { setWatchedStocks([...watchedStocks, s]); }
    setNewStock("");
  }

  function removeStock(symbol: string) {
    setWatchedStocks(watchedStocks.filter((s) => s !== symbol));
  }

  function toggleTool(tool: string) {
    setPreferredTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  }

  const sortedTools = [...tools].sort((a, b) => b[sortField] - a[sortField]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setToast({ ok: true, text: "Copied to clipboard!" });
    setTimeout(() => setToast(null), 2000);
  };

  // Skeleton helper
  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-gray-100 ${className}`} />
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">AI Optimizer</h1>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-all ${
          toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.text}
        </div>
      )}

      {/* ── Performance Trends ── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Performance Trends</h2>
          <div className="flex gap-1">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  days === d ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {perfLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : perfData.length === 0 ? (
          <p className="text-sm text-gray-400">No performance data yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perfData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: "Latency (ms)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} label={{ value: "Success Rate (%)", angle: 90, position: "insideRight", style: { fontSize: 11 } }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="avgLatencyMs" name="Avg Latency (ms)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="successRate" name="Success Rate (%)" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perfData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="queryCount" name="Query Count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* ── Prompt Optimization ── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Prompt Optimization</h2>
          <button onClick={handleAnalyze} disabled={analyzing}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {analyzing ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" className="opacity-75" />
                </svg>
                Analyzing…
              </span>
            ) : "Analyze Prompt"}
          </button>
        </div>

        {analyzeError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{analyzeError}</div>
        )}

        {suggestions.length === 0 && !analyzing && !analyzeError && (
          <p className="text-sm text-gray-400">Click &quot;Analyze Prompt&quot; to get AI-powered suggestions for improving agent performance.</p>
        )}

        {suggestions.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-lg border bg-gray-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 capitalize">{s.area}</span>
                  <button onClick={() => copyToClipboard(s.suggested)}
                    className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100">
                    Copy to Clipboard
                  </button>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Current</p>
                  <p className="text-sm text-gray-700">{s.current}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-green-600">Suggested</p>
                  <p className="text-sm text-gray-700">{s.suggested}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Reasoning</p>
                  <p className="text-sm text-gray-500">{s.reasoning}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Tool Recommendations ── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Tool Recommendations</h2>

        {toolsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : sortedTools.length === 0 ? (
          <p className="text-sm text-gray-400">No tool usage data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 w-12">Rank</th>
                  <th className="px-3 py-2">Tool Name</th>
                  <th className="px-3 py-2 cursor-pointer hover:text-gray-700" onClick={() => setSortField("score")}>
                    Score {sortField === "score" && "▼"}
                  </th>
                  <th className="px-3 py-2 cursor-pointer hover:text-gray-700" onClick={() => setSortField("frequency")}>
                    Frequency {sortField === "frequency" && "▼"}
                  </th>
                  <th className="px-3 py-2 cursor-pointer hover:text-gray-700" onClick={() => setSortField("successRate")}>
                    Success Rate {sortField === "successRate" && "▼"}
                  </th>
                  <th className="px-3 py-2">Avg Latency</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedTools.map((t, i) => (
                  <tr key={t.toolName} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{t.toolName}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-gray-200">
                          <div className={`h-2 rounded-full ${i < 3 ? "bg-green-500" : "bg-gray-400"}`}
                            style={{ width: `${Math.min(t.score, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{t.score.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{t.frequency}</td>
                    <td className="px-3 py-2">{(t.successRate * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-gray-500">{t.avgLatency.toFixed(0)}ms</td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── User Personalization ── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">User Personalization</h2>

        {prefsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Watched Stocks */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Watched Stocks</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                {watchedStocks.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-0.5 text-sm font-medium text-blue-700">
                    {s}
                    <button onClick={() => removeStock(s)} className="text-blue-400 hover:text-blue-700">&times;</button>
                  </span>
                ))}
                {watchedStocks.length === 0 && <span className="text-sm text-gray-400">No stocks watched yet</span>}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newStock} onChange={(e) => setNewStock(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStock())}
                  placeholder="AAPL" maxLength={5}
                  className="w-28 rounded border border-gray-300 px-3 py-1.5 text-sm uppercase focus:border-blue-500 focus:outline-none" />
                <button onClick={addStock} disabled={!newStock.trim()}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  Add
                </button>
              </div>
            </div>

            {/* Preferred Tools */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Preferred Tools</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {AVAILABLE_TOOLS.map((tool) => (
                  <label key={tool} className="flex items-center gap-2 rounded border px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={preferredTools.includes(tool)}
                      onChange={() => toggleTool(tool)}
                      className="rounded" />
                    {tool}
                  </label>
                ))}
              </div>
            </div>

            {/* Common Query Types */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Common Query Types</h3>
              <div className="flex flex-wrap gap-2">
                {(prefs?.commonQueryTypes ?? []).length > 0 ? (
                  prefs!.commonQueryTypes.map((qt) => (
                    <span key={qt} className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-medium text-purple-700">{qt}</span>
                  ))
                ) : (
                  <span className="text-sm text-gray-400">Auto-detected from your queries</span>
                )}
              </div>
            </div>

            {/* Save */}
            <button onClick={handleSavePrefs} disabled={saving}
              className="rounded bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save Preferences"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}