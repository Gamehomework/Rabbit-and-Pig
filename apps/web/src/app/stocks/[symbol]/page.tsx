"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import TradingViewChart, { type ChartMarker, type ChartLine } from "@/components/TradingViewChart";
import ReactMarkdown from "react-markdown";
import {
  getStockChart, getStockNews, getNotes, createNote, queryAgent,
  getNotificationChannels, sendNotification, streamAgentAnalysis,
  getStockQuote,
  type OHLCVData, type NewsItem, type Note, type NotificationChannel,
  type StockQuote,
} from "@/lib/api";

const RANGES = ["1d", "1mo", "3mo", "6mo", "1y"] as const;

function formatMarketCap(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function formatVolume(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "step"; toolName: string; thought: string | null }
  | { role: "agent_card"; agentRole: string; displayName: string; status: "thinking" | "done" | "error"; summary?: string; confidence?: number; latencyMs?: number };

export default function StockDetailPage() {
  const params = useParams<{ symbol: string }>();
  const router = useRouter();
  const symbol = (params.symbol ?? "").toUpperCase();

  // Chart
  const [chartData, setChartData] = useState<OHLCVData[]>([]);
  const [chartRange, setChartRange] = useState<string>("1mo");
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartMarkers, setChartMarkers] = useState<ChartMarker[]>([]);
  const [chartLines, setChartLines] = useState<ChartLine[]>([]);

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
  const [isRunning, setIsRunning] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Quote
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(false);

  // Send Alert modal
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertChannels, setAlertChannels] = useState<NotificationChannel[]>([]);
  const [alertChannel, setAlertChannel] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertRecipient, setAlertRecipient] = useState("");
  const [alertSending, setAlertSending] = useState(false);
  const [alertResult, setAlertResult] = useState<{ ok: boolean; text: string } | null>(null);

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

  const loadQuote = useCallback(async () => {
    setQuoteLoading(true);
    setQuoteError(false);
    try {
      setQuote(await getStockQuote(symbol));
    } catch {
      setQuoteError(true);
    } finally {
      setQuoteLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    loadChart(chartRange);
    loadNews();
    loadNotes();
    loadQuote();
  }, [symbol, chartRange, loadChart, loadNews, loadNotes, loadQuote]);

  // Auto-poll chart every 60s when viewing 1d range
  useEffect(() => {
    if (chartRange !== "1d") return;
    const timer = setInterval(() => {
      loadChart("1d");
    }, 60_000);
    return () => clearInterval(timer);
  }, [chartRange, loadChart]);

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

  function parseAnnotations(text: string) {
    const match = text.match(/```chart_annotations\n([\s\S]*?)\n```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.markers) setChartMarkers(prev => [...prev, ...parsed.markers]);
        if (parsed.lines) setChartLines(prev => [...prev, ...parsed.lines]);
        return text.replace(match[0], "\n*[Chart updated with agent analysis]*\n");
      } catch (err) {
        console.error("Failed to parse chart annotations", err);
      }
    }
    return text;
  }

  async function handleAskAI(e: React.FormEvent) {
    e.preventDefault();
    const q = aiQuery.trim();
    if (!q) return;
    setAiQuery("");
    setAiLoading(true);
    setChatMessages((prev) => [...prev, { role: "user", content: q }]);
    try {
      const res = await queryAgent(q, symbol);

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
      const finalAnswer = parseAnnotations(res.answer ?? "No answer returned.");
      newMsgs.push({
        role: "assistant",
        content: finalAnswer,
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

  function handleRunAnalysis() {
    if (isRunning) return;
    setIsRunning(true);

    const prompt = `Perform a comprehensive autonomous analysis of ${symbol}. Include current price, recent trends, key news, and a summary outlook.`;
    setChatMessages((prev) => [...prev, { role: "user", content: `🚀 Run Autonomous Analysis` }]);

    abortRef.current = streamAgentAnalysis(
      prompt,
      symbol,
      (event) => {
        if (event.type === "step" && event.toolName) {
          setChatMessages((prev) => [
            ...prev,
            { role: "step", toolName: event.toolName!, thought: event.thought ?? null },
          ]);
        } else if (event.type === "answer" && event.answer) {
          const finalAnswer = parseAnnotations(event.answer!);
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: finalAnswer },
          ]);
        } else if (event.type === "agent_start") {
          setChatMessages(prev => [...prev, {
            role: "agent_card",
            agentRole: event.role!,
            displayName: event.displayName ?? event.role!,
            status: "thinking"
          }]);
        } else if (event.type === "agent_result") {
          const newStatus: "done" | "error" = event.agentSuccess ? "done" : "error";
          setChatMessages(prev => prev.map(m =>
            m.role === "agent_card" && m.agentRole === event.role
              ? { ...m, status: newStatus, summary: event.agentSummary, confidence: event.agentConfidence, latencyMs: event.agentLatencyMs }
              : m
          ));
        } else if (event.type === "error") {
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: `⚠️ ${event.error ?? "Stream error"}` },
          ]);
        }
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      },
      (err) => {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${err.message}` },
        ]);
        setIsRunning(false);
      },
      () => {
        setIsRunning(false);
        abortRef.current = null;
      },
    );
  }

  async function openAlertModal() {
    setAlertOpen(true);
    setAlertResult(null);
    setAlertMessage(`Alert: ${symbol} - Price update`);
    try { setAlertChannels(await getNotificationChannels()); } catch { /* empty */ }
  }

  async function handleSendAlert(e: React.FormEvent) {
    e.preventDefault();
    setAlertSending(true); setAlertResult(null);
    try {
      await sendNotification({ channel: alertChannel, message: alertMessage, recipient: alertRecipient });
      setAlertResult({ ok: true, text: "Alert sent!" });
    } catch (err) {
      setAlertResult({ ok: false, text: err instanceof Error ? err.message : "Send failed" });
    } finally { setAlertSending(false); }
  }

  return (
    <div className="flex gap-6 items-start">
      {/* ── Left: main content ── */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{symbol}</h1>
            {quoteLoading ? (
              <div className="mt-1 flex items-center gap-3">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                <div className="h-6 w-20 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
              </div>
            ) : quote ? (
              <div className="mt-1 flex items-center gap-3">
                <p className="text-gray-500">{quote.name}</p>
                <span className="text-xl font-semibold">
                  {quote.currency === "USD" ? "$" : ""}{quote.price?.toFixed(2) ?? "—"}
                </span>
                <span className={`text-sm font-medium ${(quote.change ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {(quote.change ?? 0) > 0 ? "+" : ""}{quote.change?.toFixed(2) ?? "0.00"}{" "}
                  ({(quote.change ?? 0) > 0 ? "+" : ""}{quote.changePercent?.toFixed(2) ?? "0.00"}%)
                </span>
              </div>
            ) : (
              <p className="text-gray-500">Stock Detail</p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push(`/stocks/${symbol}/deep-analysis`)}
              className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
              🧠 Deep Analysis
            </button>
            <button onClick={handleRunAnalysis} disabled={isRunning}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              {isRunning ? "⏳ Running…" : "▶ Run Autonomous Analysis"}
            </button>
            <button onClick={openAlertModal}
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
              🔔 Send Alert
            </button>
          </div>
        </div>

        {/* Key Stats */}
        {quoteLoading && (
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="h-3 w-16 animate-pulse rounded bg-gray-200 mb-2" />
                <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        )}
        {!quoteLoading && !quoteError && quote && (
          <div className="grid grid-cols-5 gap-4">
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">Market Cap</p>
              <p className="mt-1 text-lg font-semibold">{formatMarketCap(quote.marketCap)}</p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">P/E Ratio</p>
              <p className="mt-1 text-lg font-semibold">{quote.peRatio != null ? quote.peRatio.toFixed(2) : "—"}</p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">Day Range</p>
              <p className="mt-1 text-lg font-semibold">
                {quote.dayLow?.toFixed(2) ?? "—"} – {quote.dayHigh?.toFixed(2) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">52W Range</p>
              <p className="mt-1 text-lg font-semibold">
                {quote.low52w?.toFixed(2) ?? "—"} – {quote.high52w?.toFixed(2) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">Volume</p>
              <p className="mt-1 text-lg font-semibold">{formatVolume(quote.volume)}</p>
            </div>
          </div>
        )}

      {/* Alert Modal */}
      {alertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAlertOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Send Alert for {symbol}</h3>
              <button onClick={() => setAlertOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSendAlert} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Channel</label>
                <select value={alertChannel} onChange={(e) => setAlertChannel(e.target.value)} required
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">Select channel…</option>
                  {alertChannels.map((c) => <option key={c.channelType} value={c.channelType}>{c.channelType}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Message</label>
                <textarea value={alertMessage} onChange={(e) => setAlertMessage(e.target.value)} rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Recipient</label>
                <input type="text" value={alertRecipient} onChange={(e) => setAlertRecipient(e.target.value)}
                  placeholder="user/id" required
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <button type="submit" disabled={alertSending || !alertChannel}
                className="w-full rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
                {alertSending ? "Sending…" : "Send Alert"}
              </button>
            </form>
            {alertResult && (
              <p className={`mt-2 text-sm ${alertResult.ok ? "text-green-600" : "text-red-600"}`}>{alertResult.text}</p>
            )}
          </div>
        </div>
      )}

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
          <TradingViewChart
            data={chartData}
            markers={chartMarkers}
            lines={chartLines}
          />
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
              if (msg.role === "agent_card") {
                return (
                  <div key={i} className="rounded-lg border px-3 py-2 text-sm bg-indigo-50 border-indigo-200">
                    <div className="flex items-center gap-2">
                      {msg.status === "thinking" ? (
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                      ) : msg.status === "done" ? (
                        <span>✅</span>
                      ) : (
                        <span>❌</span>
                      )}
                      <span className="font-medium text-indigo-800">{msg.displayName}</span>
                      {msg.status === "done" && msg.confidence != null && (
                        <span className="ml-auto text-xs text-indigo-500">{Math.round(msg.confidence * 100)}%</span>
                      )}
                      {msg.status === "done" && msg.latencyMs != null && (
                        <span className="text-xs text-gray-400">{(msg.latencyMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                    {msg.status !== "thinking" && msg.summary && (
                      <p className="mt-1 text-xs text-gray-600 line-clamp-2">{msg.summary}</p>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap bg-blue-600 text-white">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-800 prose prose-sm prose-gray max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              );
            })}
            {(aiLoading || isRunning) && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500 animate-pulse">
                  {isRunning ? "Running analysis…" : "Thinking…"}
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleAskAI} className="border-t p-3 flex gap-2">
            <input
              type="text"
              placeholder={isRunning ? "Analysis in progress…" : `Ask about ${symbol}…`}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              disabled={isRunning}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
            />
            <button
              type="submit"
              disabled={aiLoading || isRunning || !aiQuery.trim()}
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