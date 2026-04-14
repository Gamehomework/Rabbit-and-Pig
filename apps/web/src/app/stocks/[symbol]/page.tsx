"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  getStockChart, getStockNews, getNotes, createNote, queryAgent,
  type OHLCVData, type NewsItem, type Note, type AgentResponse,
} from "@/lib/api";

const RANGES = ["1d", "1mo", "3mo", "6mo", "1y"] as const;

export default function StockDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();

  // Chart
  const [chartData, setChartData] = useState<OHLCVData[]>([]);
  const [chartRange, setChartRange] = useState<string>("1mo");
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  // News
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  // Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // AI
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState<AgentResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadChart = useCallback(async (range: string) => {
    setChartLoading(true);
    setChartError(null);
    try {
      const data = await getStockChart(symbol, range);
      setChartData(data);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : "Failed to load chart");
    } finally {
      setChartLoading(false);
    }
  }, [symbol]);

  const loadNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError(null);
    try {
      setNews(await getStockNews(symbol));
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : "Failed to load news");
    } finally {
      setNewsLoading(false);
    }
  }, [symbol]);

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      setNotes(await getNotes(symbol));
    } catch { /* notes may not exist yet */ }
    finally { setNotesLoading(false); }
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    loadChart(chartRange);
    loadNews();
    loadNotes();
  }, [symbol, chartRange, loadChart, loadNews, loadNotes]);

  async function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    setNoteSaving(true);
    try {
      await createNote({ title: noteTitle, content: noteContent, stockSymbol: symbol });
      setNoteTitle("");
      setNoteContent("");
      await loadNotes();
    } catch { /* ignore */ }
    finally { setNoteSaving(false); }
  }

  async function handleAskAI(e: React.FormEvent) {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await queryAgent(`${aiQuery} (regarding stock ${symbol})`);
      setAiResponse(res);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI query failed");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{symbol}</h1>
        <p className="text-gray-500">Stock Detail</p>
      </div>

      {/* Price Chart */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Price Chart</h2>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  chartRange === r ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {chartLoading && <p className="py-8 text-center text-gray-500">Loading chart…</p>}
        {chartError && <p className="py-8 text-center text-red-600">{chartError}</p>}
        {!chartLoading && !chartError && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="close" stroke="#2563eb" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {!chartLoading && !chartError && chartData.length === 0 && (
          <p className="py-8 text-center text-gray-400">No chart data available</p>
        )}
      </section>

      {/* News Feed */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Recent News</h2>
        {newsLoading && <p className="text-gray-500">Loading news…</p>}
        {newsError && <p className="text-red-600">{newsError}</p>}
        {!newsLoading && !newsError && news.length === 0 && (
          <p className="text-gray-400">No news available</p>
        )}
        <ul className="divide-y">
          {news.map((item, i) => (
            <li key={i} className="py-3">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                {item.title}
              </a>
              <p className="mt-1 text-xs text-gray-500">
                {item.source} · {new Date(item.publishedAt).toLocaleDateString()}
              </p>
              {item.summary && <p className="mt-1 text-sm text-gray-600">{item.summary}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* Notes */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Notes</h2>
        {notesLoading && <p className="text-gray-500">Loading notes…</p>}
        {notes.length > 0 && (
          <ul className="mb-4 divide-y">
            {notes.map((note) => (
              <li key={note.id} className="py-3">
                <h3 className="font-medium">{note.title}</h3>
                <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{note.content}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleCreateNote} className="space-y-2 border-t pt-4">
          <input
            type="text"
            placeholder="Note title"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <textarea
            placeholder="Note content…"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={3}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={noteSaving || !noteTitle.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {noteSaving ? "Saving…" : "Add Note"}
          </button>
        </form>
      </section>

      {/* AI Insight */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Ask AI</h2>
        <form onSubmit={handleAskAI} className="flex gap-2">
          <input
            type="text"
            placeholder={`Ask about ${symbol}…`}
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={aiLoading || !aiQuery.trim()}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {aiLoading ? "Thinking…" : "Ask"}
          </button>
        </form>
        {aiError && <p className="mt-3 text-sm text-red-600">{aiError}</p>}
        {aiResponse && (
          <div className="mt-4 rounded border bg-gray-50 p-4">
            <p className="whitespace-pre-wrap text-sm">{aiResponse.answer}</p>
          </div>
        )}
      </section>


    </div>
  );
}