"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  getStockChart, getStockNews, getNotes, createNote, queryAgent,
  type OHLCVData, type NewsItem, type Note,
} from "@/lib/api";

const RANGES = ["1d", "1mo", "3mo", "6mo", "1y"] as const;

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "step"; toolName: string; thought: string | null };

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

  // AI chat history
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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
    const q = aiQuery.trim();
    if (!q) return;
    setAiQuery("");
    setAiLoading(true);
    setChatMessages((prev) => [...prev, { role: "user", content: q }]);
    try {
      const res = await queryAgent(`${q} (regarding stock ${symbol})`);

      // Build all new messages: steps first, then final answer
      const newMsgs: ChatMessage[] = [];
      for (const step of res.steps) {
        if (step.toolCall) {
          newMsgs.push({
            role: "step",
            toolName: step.toolCall.name,
            thought: step.thought,
          });
        }
      }
      newMsgs.push({
        role: "assistant",
        content: res.answer ?? "No answer returned.",
      });

      setChatMessages((prev) => [...prev, ...newMsgs]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI query failed";
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${msg}` },
      ]);
    } finally {
      setAiLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex gap-6 items-start">
      {/* ── Left: main content ── */}
      <div className="min-w-0 flex-1 space-y-6">
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

      </div>{/* end left column */}

      {/* ── Right: sticky AI chat sidebar ── */}
      <div className="w-96 shrink-0 sticky top-6">
        <div className="flex h-[calc(100vh-7rem)] flex-col rounded-lg border bg-white shadow-sm">
          {/* Header */}
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">Ask AI about {symbol}</h2>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-center text-sm text-gray-400 mt-8">
                Ask anything about {symbol}…
              </p>
            )}
            {chatMessages.map((msg, i) => {
              if (msg.role === "step") {
                return (
                  <div key={i} className="flex items-start gap-1.5 pl-1">
                    <span className="mt-0.5 text-xs text-gray-400">⚙</span>
                    <div className="text-xs text-gray-400 leading-snug">
                      <span className="font-medium text-gray-500">{msg.toolName}</span>
                      {msg.thought && (
                        <span className="ml-1 italic">— {msg.thought}</span>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}
            {aiLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500 animate-pulse">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleAskAI} className="border-t p-3 flex gap-2">
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
              className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}