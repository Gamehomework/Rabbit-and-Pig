"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, LineChart, Line,
} from "recharts";
import {
  getAnalyticsOverview, getAnalyticsQueries, getAnalyticsTools,
  getAnalyticsSessions, getAnalyticsSessionDetail, getAnalyticsNotifications,
  getAnalyticsExportUrl, getNotesAnalytics,
  type AnalyticsOverview, type QueryDataPoint, type ToolStats,
  type SessionSummary, type SessionDetail, type NotificationStats,
  type NotesAnalytics,
} from "@/lib/api";

// --- Helpers ---
function toISODate(d: Date) { return d.toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

const PIE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

type SortKey = "toolName" | "count" | "avgLatencyMs" | "successRate";
type SortDir = "asc" | "desc";

// --- Component ---
export default function AnalyticsPage() {
  // Date range
  const [from, setFrom] = useState(toISODate(daysAgo(7)));
  const [to, setTo] = useState(toISODate(new Date()));

  // Data
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [queries, setQueries] = useState<QueryDataPoint[]>([]);
  const [tools, setTools] = useState<ToolStats[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [notifications, setNotifications] = useState<NotificationStats[]>([]);
  const [notesAnalytics, setNotesAnalytics] = useState<NotesAnalytics | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>("day");
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, q, t, s, n, na] = await Promise.allSettled([
        getAnalyticsOverview(from, to),
        getAnalyticsQueries(period, from, to),
        getAnalyticsTools(from, to),
        getAnalyticsSessions(),
        getAnalyticsNotifications(from, to),
        getNotesAnalytics(from, to),
      ]);
      if (ov.status === "fulfilled") setOverview(ov.value);
      if (q.status === "fulfilled") setQueries(q.value);
      if (t.status === "fulfilled") setTools(t.value);
      if (s.status === "fulfilled") setSessions(s.value);
      if (n.status === "fulfilled") setNotifications(n.value);
      if (na.status === "fulfilled") setNotesAnalytics(na.value);
    } catch { /* ignore */ }
    setLoading(false);
  }, [from, to, period]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchAll, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchAll]);

  // Sort tools
  const sortedTools = useMemo(() => {
    const arr = [...tools];
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [tools, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const handleSessionClick = async (id: number) => {
    if (expandedSession === id) { setExpandedSession(null); return; }
    setExpandedSession(id);
    try { setSessionDetail(await getAnalyticsSessionDetail(id)); } catch { setSessionDetail(null); }
  };

  const applyPreset = (days: number) => {
    setFrom(toISODate(days === 0 ? new Date() : daysAgo(days)));
    setTo(toISODate(new Date()));
  };

  const handleExport = (type: "queries" | "tools" | "sessions", format: "csv" | "json") => {
    window.open(getAnalyticsExportUrl(format, type, from, to), "_blank");
    setExportOpen(false);
  };

  const rateColor = (r: number) => r >= 90 ? "text-green-600" : r >= 70 ? "text-yellow-600" : "text-red-600";
  const rateBg = (r: number) => r >= 90 ? "bg-green-50" : r >= 70 ? "bg-yellow-50" : "bg-red-50";

  // Skeleton placeholder
  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm flex items-center gap-2 cursor-pointer">
            <span className="text-gray-500">{autoRefresh ? "Refreshing every 30s" : "Auto-refresh"}</span>
            <button onClick={() => setAutoRefresh(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoRefresh ? "bg-indigo-600" : "bg-gray-300"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoRefresh ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </label>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-gray-600">From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
        <label className="text-sm font-medium text-gray-600">To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm" />
        {[["Today", 0], ["7 Days", 7], ["30 Days", 30], ["90 Days", 90]].map(([label, days]) => (
          <button key={label as string} onClick={() => applyPreset(days as number)}
            className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium hover:bg-gray-200 transition-colors">
            {label as string}
          </button>
        ))}
      </div>

      {/* Overview Cards */}
      {loading && !overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Total Queries", value: overview.totalQueries.toLocaleString(), icon: "📊", color: "border-indigo-400" },
            { label: "Avg Latency", value: `${overview.avgLatencyMs.toFixed(0)}ms`, icon: "⚡", color: overview.avgLatencyMs < 500 ? "border-green-400" : "border-yellow-400" },
            { label: "Success Rate", value: `${overview.successRate.toFixed(1)}%`, icon: "✅", color: overview.successRate >= 90 ? "border-green-400" : "border-yellow-400" },
            { label: "Active Sessions", value: overview.activeSessions.toLocaleString(), icon: "👥", color: "border-blue-400" },
            { label: "Notifications", value: overview.totalNotifications.toLocaleString(), icon: "🔔", color: "border-purple-400" },
          ].map(card => (
            <div key={card.label} className={`rounded-lg bg-white p-4 shadow-sm border-l-4 ${card.color}`}>
              <div className="flex items-center justify-between">
                <span className="text-2xl">{card.icon}</span>
                <span className="text-xl font-bold">{card.value}</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">{card.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Query Volume Chart */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Query Volume</h2>
          <div className="flex gap-1">
            {["hour", "day", "week"].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${period === p ? "bg-indigo-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {loading && queries.length === 0 ? <Skeleton className="h-64" /> : queries.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-gray-400">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={queries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} tickFormatter={v => new Date(v).toLocaleDateString()} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={v => new Date(v).toLocaleString()} />
              <Area type="monotone" dataKey="count" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tool Usage – Pie + Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Tool Usage Distribution</h2>
          {loading && tools.length === 0 ? <Skeleton className="h-64" /> : tools.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-400">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={tools} dataKey="count" nameKey="toolName" cx="50%" cy="50%" outerRadius={90} label={({ name }) => name}>
                  {tools.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Avg Latency by Tool</h2>
          {loading && tools.length === 0 ? <Skeleton className="h-64" /> : tools.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-400">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={tools}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="toolName" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="avgLatencyMs" fill="#f59e0b" name="Avg Latency (ms)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tool Performance Table */}
      <div className="rounded-lg bg-white p-4 shadow-sm overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold">Tool Performance</h2>
        {loading && tools.length === 0 ? <Skeleton className="h-40" /> : tools.length === 0 ? (
          <p className="text-gray-400 py-6 text-center">No data yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                {([["Tool Name", "toolName"], ["Calls", "count"], ["Avg Latency (ms)", "avgLatencyMs"], ["Success Rate (%)", "successRate"]] as [string, SortKey][]).map(([label, key]) => (
                  <th key={key} onClick={() => toggleSort(key)} className="cursor-pointer px-3 py-2 hover:text-gray-800 select-none">
                    {label} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTools.map(t => (
                <tr key={t.toolName} className={`border-b last:border-0 ${rateBg(t.successRate)}`}>
                  <td className="px-3 py-2 font-medium">{t.toolName}</td>
                  <td className="px-3 py-2">{t.count}</td>
                  <td className="px-3 py-2">{t.avgLatencyMs.toFixed(0)}</td>
                  <td className={`px-3 py-2 font-semibold ${rateColor(t.successRate)}`}>{t.successRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      {/* Notes Analytics */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Notes Analytics</h2>
        {!notesAnalytics ? (
          loading ? <Skeleton className="h-64" /> : <div className="flex h-64 items-center justify-center text-gray-400">No data yet</div>
        ) : (
          <div className="space-y-6">
            {/* Notes count + Research Focus badges */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                <span className="text-2xl font-bold text-indigo-700">{notesAnalytics.totalNotes}</span>
                <p className="text-sm text-indigo-500">Total Notes</p>
              </div>
              {notesAnalytics.topNotedStocks.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-500">Research Focus</p>
                  <div className="flex flex-wrap gap-1">
                    {notesAnalytics.topNotedStocks.map((s) => (
                      <span key={s} className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notes Trend + Top Stocks charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-500">Notes Trend (Daily)</h3>
                {notesAnalytics.notesTrend.length === 0 ? (
                  <div className="flex h-52 items-center justify-center text-gray-400">No trend data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={notesAnalytics.notesTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} tickFormatter={(v) => new Date(v).toLocaleDateString()} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(v) => new Date(v as string).toLocaleDateString()} />
                      <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-500">Top Stocks by Notes</h3>
                {notesAnalytics.notesByStock.length === 0 ? (
                  <div className="flex h-52 items-center justify-center text-gray-400">No stock data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={notesAnalytics.notesByStock.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                      <YAxis dataKey="stockSymbol" type="category" tick={{ fontSize: 12 }} width={60} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8b5cf6" name="Notes" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Noted but never queried */}
            {notesAnalytics.notedButNeverQueried.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-500">Researched but Never Queried</h3>
                <div className="flex flex-wrap gap-1">
                  {notesAnalytics.notedButNeverQueried.map((s) => (
                    <span key={s} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Session List */}
      <div className="rounded-lg bg-white p-4 shadow-sm overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold">Recent Sessions</h2>
        {loading && sessions.length === 0 ? <Skeleton className="h-40" /> : sessions.length === 0 ? (
          <p className="text-gray-400 py-6 text-center">No data yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Queries</th>
                <th className="px-3 py-2">Tool Calls</th>
                <th className="px-3 py-2">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <React.Fragment key={s.id}>
                  <tr className="border-b cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => handleSessionClick(s.id)}>
                    <td className="px-3 py-2 font-mono text-xs">#{s.id}</td>
                    <td className="px-3 py-2">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{s.queryCount}</td>
                    <td className="px-3 py-2">{s.toolCalls}</td>
                    <td className="px-3 py-2">{s.avgLatency.toFixed(0)}ms</td>
                  </tr>
                  {expandedSession === s.id && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50 px-4 py-3">
                        {sessionDetail && sessionDetail.session.id === s.id ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase">Session Trace</p>
                            {[...(sessionDetail.queries || []), ...(sessionDetail.decisions || []), ...(sessionDetail.toolExecutions || [])].length === 0 ? (
                              <p className="text-gray-400 text-sm">No trace data</p>
                            ) : (
                              <div className="space-y-1">
                                {(sessionDetail.decisions as Array<Record<string, unknown>>)?.map((d, i) => (
                                  <div key={`d-${i}`} className="flex gap-2 text-xs">
                                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 font-medium">thought</span>
                                    <span>{String(d.thought || d.action || JSON.stringify(d))}</span>
                                  </div>
                                ))}
                                {(sessionDetail.toolExecutions as Array<Record<string, unknown>>)?.map((t, i) => (
                                  <div key={`t-${i}`} className="flex gap-2 text-xs">
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 font-medium">tool</span>
                                    <span>{String(t.toolName || t.name || JSON.stringify(t))}</span>
                                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 font-medium">result</span>
                                    <span className="truncate max-w-xs">{String(t.result ?? "")}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Skeleton className="h-16" />
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Notification Analytics */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Notification Analytics</h2>
        {loading && notifications.length === 0 ? <Skeleton className="h-64" /> : notifications.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-gray-400">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={notifications}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="sent" stackId="a" fill="#10b981" name="Sent" />
              <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
              <Bar dataKey="rateLimited" stackId="a" fill="#f59e0b" name="Rate Limited" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Export Buttons */}
      <div className="relative inline-block">
        <button onClick={() => setExportOpen(v => !v)}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
          Export Data ▾
        </button>
        {exportOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg bg-white shadow-lg border">
            {(["queries", "tools", "sessions"] as const).map(type => (
              <div key={type} className="border-b last:border-0">
                <p className="px-3 pt-2 text-xs font-semibold text-gray-400 uppercase">{type}</p>
                <div className="flex gap-2 px-3 pb-2 pt-1">
                  <button onClick={() => handleExport(type, "csv")} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">CSV</button>
                  <button onClick={() => handleExport(type, "json")} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">JSON</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}