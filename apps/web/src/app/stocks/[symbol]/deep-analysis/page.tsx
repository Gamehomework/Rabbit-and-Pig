"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { streamMultiAgentAnalysis, type MultiAgentEvent } from "@/lib/api";

/** Agent role display info */
const AGENT_ROLES = [
  { role: "news_crawler", icon: "📰", label: "News Crawler" },
  { role: "fundamental", icon: "📊", label: "Fundamental Analyst" },
  { role: "quant", icon: "🔢", label: "Quant Analyst" },
  { role: "strategist", icon: "🎯", label: "Strategy Maker" },
  { role: "decision_maker", icon: "⚖️", label: "Decision Maker" },
  { role: "visualizer", icon: "📈", label: "Visualizer" },
] as const;

type AgentStatus = "waiting" | "thinking" | "done" | "error";

interface AgentCard {
  role: string;
  icon: string;
  label: string;
  status: AgentStatus;
  summary?: string;
  data?: Record<string, unknown>;
  confidence?: number;
  latencyMs?: number;
}

export default function DeepAnalysisPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();

  const [isRunning, setIsRunning] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [agents, setAgents] = useState<AgentCard[]>(
    AGENT_ROLES.map((r) => ({ ...r, status: "waiting" as AgentStatus }))
  );
  const [coordinatorThoughts, setCoordinatorThoughts] = useState<string[]>([]);
  const [finalReport, setFinalReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const updateAgent = useCallback((role: string, update: Partial<AgentCard>) => {
    setAgents((prev) => prev.map((a) => (a.role === role ? { ...a, ...update } : a)));
  }, []);

  function handleStart() {
    if (isRunning) return;
    setIsRunning(true);
    setError(null);
    setFinalReport(null);
    setCoordinatorThoughts([]);
    setAgents(AGENT_ROLES.map((r) => ({ ...r, status: "waiting" as AgentStatus })));

    const urls = urlInput
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    const query = `Perform a comprehensive deep analysis of ${symbol}. Include news analysis, fundamental analysis, technical/quantitative analysis, strategy recommendations, and a final verdict.`;

    abortRef.current = streamMultiAgentAnalysis(
      query,
      { stockSymbol: symbol, urls: urls.length > 0 ? urls : undefined },
      (event: MultiAgentEvent) => {
        switch (event.type) {
          case "coordinator_thought":
            if (event.thought) {
              setCoordinatorThoughts((prev) => [...prev, event.thought!]);
            }
            break;
          case "agent_start":
            if (event.role) {
              updateAgent(event.role, { status: "thinking" });
            }
            break;
          case "agent_result":
            if (event.role) {
              updateAgent(event.role, {
                status: event.success ? "done" : "error",
                summary: event.summary,
                data: event.data,
                confidence: event.confidence,
                latencyMs: event.latencyMs,
              });
            }
            break;
          case "final_report":
            setFinalReport(event.summary ?? "Analysis complete.");
            break;
          case "error":
            setError(event.message ?? "An error occurred.");
            break;
        }
      },
      (err) => {
        setError(err.message);
        setIsRunning(false);
      },
      () => {
        setIsRunning(false);
        abortRef.current = null;
      }
    );
  }

  function handleStop() {
    abortRef.current?.abort();
    setIsRunning(false);
  }

  const statusColors: Record<AgentStatus, string> = {
    waiting: "bg-gray-100 text-gray-500 border-gray-200",
    thinking: "bg-blue-50 text-blue-700 border-blue-300 animate-pulse",
    done: "bg-green-50 text-green-700 border-green-300",
    error: "bg-red-50 text-red-700 border-red-300",
  };

  const statusIcons: Record<AgentStatus, string> = {
    waiting: "⏳", thinking: "🔄", done: "✅", error: "❌",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/stocks/${symbol}`} className="text-blue-600 hover:underline text-sm">
              ← {symbol}
            </Link>
          </div>
          <h1 className="text-2xl font-bold">🧠 Deep Analysis — {symbol}</h1>
          <p className="text-sm text-gray-500">Multi-agent AI analysis with 6 specialist agents</p>
        </div>
        <div className="flex gap-2">
          {isRunning ? (
            <button onClick={handleStop} className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
              ⏹ Stop
            </button>
          ) : (
            <button onClick={handleStart} className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
              🚀 Start Deep Analysis
            </button>
          )}
        </div>
      </div>

      {/* URL Input */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-2">📎 News URLs (optional)</h2>
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder={"Paste news article URLs here, one per line...\nhttps://example.com/article-1\nhttps://example.com/article-2"}
          rows={3}
          disabled={isRunning}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none disabled:bg-gray-50"
        />
      </section>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700 text-sm">{error}</div>
      )}

      {/* Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.role}
            className={`rounded-lg border-2 p-4 transition-all ${statusColors[agent.status]}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{agent.icon}</span>
                <h3 className="font-semibold text-sm">{agent.label}</h3>
              </div>
              <span className="text-sm">{statusIcons[agent.status]}</span>
            </div>
            {agent.status === "thinking" && (
              <p className="text-xs italic">Analyzing...</p>
            )}
            {agent.status === "done" && agent.summary && (
              <div>
                <p className="text-xs mt-1 line-clamp-4">{agent.summary}</p>
                <div className="mt-2 flex items-center gap-3 text-xs opacity-70">
                  {agent.confidence != null && (
                    <span>Confidence: {Math.round(agent.confidence * 100)}%</span>
                  )}
                  {agent.latencyMs != null && (
                    <span>{(agent.latencyMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>
            )}
            {agent.status === "error" && agent.summary && (
              <p className="text-xs mt-1">{agent.summary}</p>
            )}
          </div>
        ))}
      </div>

      {/* Coordinator Thoughts */}
      {coordinatorThoughts.length > 0 && (
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-2">🧠 Coordinator Thoughts</h2>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {coordinatorThoughts.map((thought, i) => (
              <p key={i} className="text-xs text-gray-600 border-l-2 border-purple-300 pl-2">
                {thought}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Final Report */}
      {finalReport && (
        <section className="rounded-lg border-2 border-purple-300 bg-purple-50 p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-3">📋 Final Report</h2>
          <div className="text-sm text-gray-800 prose prose-sm prose-gray max-w-none">
            <ReactMarkdown>{finalReport}</ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  );
}

