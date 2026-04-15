/**
 * Agent Core: ReAct execution loop using DeepSeek API (OpenAI-compatible).
 *
 * Flow: receive query → LLM plans → parse action → execute tool → observe → repeat
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { ToolRegistry } from "./tools/registry.js";
import type { ToolResult } from "./tools/types.js";
import { validateToolInput } from "./tools/validate.js";
import {
  logAgentStep,
  logToolExecution,
  logAgentStart,
  logAgentEnd,
} from "./logger.js";

/** Configuration for the agent */
export interface AgentConfig {
  /** Maximum number of iterations before stopping (default: 10) */
  maxIterations?: number;
  /** Timeout per tool execution in ms (default: 30000) */
  toolTimeoutMs?: number;
  /** DeepSeek model name (default: deepseek-chat) */
  model?: string;
  /** System prompt override */
  systemPrompt?: string;
  /**
   * Optional step callback fired during run() for each tool call and result.
   * Lets callers stream progress without switching to runStream().
   */
  onStep?: (event: AgentStreamEvent) => void;
}

/** Accumulated token usage across all LLM calls in a run */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** A single step in the agent execution trace */
export interface AgentStep {
  iteration: number;
  thought: string | null;
  toolCall: { name: string; input: unknown } | null;
  toolResult: ToolResult | null;
}

/** Result of a complete agent run */
export interface AgentRunResult {
  sessionId: string;
  query: string;
  finalAnswer: string | null;
  steps: AgentStep[];
  totalIterations: number;
  success: boolean;
  /** Accumulated token usage across all LLM calls in this run */
  tokenUsage: TokenUsage;
}

/** Events emitted during streaming agent execution */
export type AgentStreamEvent =
  | { type: "step"; data: { iteration: number; thought: string | null; action: "thought" | "tool_call"; toolName?: string; toolInput?: unknown } }
  | { type: "tool_result"; data: { iteration: number; toolName: string; result: ToolResult } }
  | { type: "answer"; data: { sessionId: string; answer: string | null; totalIterations: number; tokenUsage: TokenUsage } }
  | { type: "error"; data: { message: string } };

export const DEFAULT_SYSTEM_PROMPT = `You are an expert stock research assistant with access to real-time and historical market data.

## Available Tools
- **get_quote**: Real-time quote for a single stock — current price, daily change %, day high/low, 52-week range, market cap, P/E ratio, volume. USE THIS FIRST for any question about current price or today's performance.
- **chart_data**: Historical OHLCV price data for any stock over a chosen range (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y). Use for trend analysis and price history.
- **get_news**: Recent news headlines for a stock from Yahoo Finance RSS. Use for sentiment, events, and company news.
- **stock_screener**: Screen/filter a broad list of actively traded stocks by sector, market cap range, P/E range, or volume. Use for discovery, not single-stock lookup.

## How to Answer Common Questions
- "What is X's current price / today's performance?" → call get_quote(symbol)
- "Analyze X's recent performance" → call get_quote + chart_data(range="1mo") + get_news
- "What's happening with X?" → call get_quote + get_news
- "Find tech stocks with low P/E" → call stock_screener

## Rules
1. ALWAYS call tools to get actual data — never invent or guess prices, percentages, or metrics.
2. If pre-loaded market data is provided above the conversation, use it first and only call tools for additional depth.
3. Format numbers clearly: "$10.37", "▲2.3% today", "$57.9B market cap".
4. Be concise and data-driven. Structure your answer with the key numbers first, then interpretation.
5. Respond in the same language as the user's question.
6. If the user asks you to draw on the chart, output a JSON block wrapped in \`\`\`chart_annotations ... \`\`\` with "markers" and/or "lines" arrays. Example:
\`\`\`chart_annotations
{
  "markers": [{ "time": "2024-03-15", "position": "aboveBar", "color": "#e91e63", "shape": "arrowDown", "text": "Sell" }],
  "lines": [{ "title": "SMA", "color": "blue", "data": [{ "time": "2024-03-14", "value": 150.5 }] }]
}
\`\`\`
Use dates in YYYY-MM-DD format.

## Page Control Tools
You have access to page control tools that let you interact with the UI:
- **set_chart_range**: Switch chart timeframe (1d, 1mo, 3mo, 6mo, 1y). Use after analysis to show the most relevant range.
- **add_price_level**: Draw a horizontal line on the chart at a price (support/resistance). Use when you identify key levels.
- **filter_news**: Filter or highlight news by keywords. Use when the user wants to focus on specific topics.
- **scroll_to_section**: Scroll to a page section (chart, news, notes, chat). Use after analysis to direct attention.
- **prefill_note**: Pre-fill the Notes form with title + content. Use to help the user save analysis results.
- **navigate_to**: Navigate to another page (deep-analysis, home).
- **calc_indicator_series**: Calculate SMA/EMA/Bollinger time-series data for a stock. Returns chart-ready line data.
- **add_indicator_lines**: Draw indicator lines on the chart using data from calc_indicator_series.

**Workflow for adding indicators:**
When user asks to add SMA, EMA, or Bollinger Bands to the chart:
1. Call calc_indicator_series(symbol, indicators, range) to compute the time-series
2. Call add_indicator_lines({ lines: result.lines }) to draw them on the chart
Example: user says "add SMA20 and SMA50" → calc_indicator_series(symbol="{stock}", indicators=["SMA20","SMA50"]) → add_indicator_lines({lines: ...})

### When to use page control tools
- When the user says "show me", "switch to", "change", "filter", "highlight", or similar control commands.
- After completing analysis, use set_chart_range to switch to the most meaningful timeframe.
- When you find support/resistance levels, use add_price_level to mark them on the chart.
- After analysis, use scroll_to_section("chart") to direct the user to see the results.`;

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL = "deepseek-chat";

export class Agent {
  private client: OpenAI;
  private registry: ToolRegistry;
  private config: Required<Omit<AgentConfig, "onStep">> & Pick<AgentConfig, "onStep">;

  constructor(registry: ToolRegistry, config: AgentConfig = {}) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY environment variable is required.");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com",
    });

    this.registry = registry;
    this.config = {
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      toolTimeoutMs: config.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
      model: config.model ?? DEFAULT_MODEL,
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      onStep: config.onStep,
    };
  }

  /** Run the agent with a query. Returns structured result with trace. */
  async run(query: string, conversationHistory: ChatCompletionMessageParam[] = []): Promise<AgentRunResult> {
    const sessionId = crypto.randomUUID();
    logAgentStart(sessionId, query);

    const steps: AgentStep[] = [];
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.config.systemPrompt },
      ...conversationHistory,
      { role: "user", content: query },
    ];
    const tools = this.registry.toFunctionDefinitions();

    let finalAnswer: string | null = null;
    let iteration = 0;
    const tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    while (iteration < this.config.maxIterations) {
      iteration++;

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      // Accumulate token usage across all LLM calls
      if (response.usage) {
        tokenUsage.promptTokens += response.usage.prompt_tokens;
        tokenUsage.completionTokens += response.usage.completion_tokens;
        tokenUsage.totalTokens += response.usage.total_tokens;
      }

      const choice = response.choices[0];
      if (!choice) {
        break;
      }

      const assistantMessage = choice.message;
      messages.push(assistantMessage as ChatCompletionMessageParam);

      // If no tool calls, the LLM has produced a final answer
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const answerContent = typeof assistantMessage.content === "string"
          ? assistantMessage.content
          : null;
        finalAnswer = answerContent;
        const step: AgentStep = {
          iteration,
          thought: answerContent,
          toolCall: null,
          toolResult: null,
        };
        steps.push(step);
        logAgentStep({
          iteration,
          thought: answerContent,
          action: "final_answer",
          toolName: null,
          toolInput: null,
          result: answerContent,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      // Process each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function") continue;
        const toolName = toolCall.function.name;
        let toolInput: unknown;
        try {
          toolInput = JSON.parse(toolCall.function.arguments);
        } catch {
          toolInput = toolCall.function.arguments;
        }
        // Handle double-encoded JSON (LLM sometimes wraps large payloads in a string)
        if (typeof toolInput === 'string') {
          try { toolInput = JSON.parse(toolInput as string); } catch { /* keep as-is */ }
        }

        const thought = typeof assistantMessage.content === "string"
          ? assistantMessage.content
          : null;

        // Notify onStep listeners before execution
        this.config.onStep?.({ type: "step", data: { iteration, thought, action: "tool_call", toolName, toolInput } });

        const toolResult = await this.executeTool(toolName, toolInput);

        // Notify onStep listeners after execution
        this.config.onStep?.({ type: "tool_result", data: { iteration, toolName, result: toolResult } });

        const step: AgentStep = {
          iteration,
          thought,
          toolCall: { name: toolName, input: toolInput },
          toolResult,
        };
        steps.push(step);

        logAgentStep({
          iteration,
          thought,
          action: "tool_call",
          toolName,
          toolInput,
          result: toolResult.output,
          timestamp: new Date().toISOString(),
        });

        // Add tool result as a message for the next iteration
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: typeof toolResult.output === "string"
            ? toolResult.output
            : JSON.stringify(toolResult.output),
        });
      }
    }

    const success = finalAnswer !== null;
    logAgentEnd(sessionId, finalAnswer, iteration, success);

    return {
      sessionId,
      query,
      finalAnswer,
      steps,
      totalIterations: iteration,
      success,
      tokenUsage,
    };
  }

  /** Run the agent with streaming: yields events as they happen. */
  async *runStream(query: string, conversationHistory: ChatCompletionMessageParam[] = []): AsyncGenerator<AgentStreamEvent> {
    const sessionId = crypto.randomUUID();
    logAgentStart(sessionId, query);

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.config.systemPrompt },
      ...conversationHistory,
      { role: "user", content: query },
    ];
    const tools = this.registry.toFunctionDefinitions();

    let iteration = 0;
    const tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (iteration < this.config.maxIterations) {
        iteration++;

        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });

        // Accumulate token usage across all LLM calls
        if (response.usage) {
          tokenUsage.promptTokens += response.usage.prompt_tokens;
          tokenUsage.completionTokens += response.usage.completion_tokens;
          tokenUsage.totalTokens += response.usage.total_tokens;
        }

        const choice = response.choices[0];
        if (!choice) break;

        const assistantMessage = choice.message;
        messages.push(assistantMessage as ChatCompletionMessageParam);

        // No tool calls → final answer
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          const answerContent = typeof assistantMessage.content === "string"
            ? assistantMessage.content
            : null;

          logAgentStep({
            iteration,
            thought: answerContent,
            action: "final_answer",
            toolName: null,
            toolInput: null,
            result: answerContent,
            timestamp: new Date().toISOString(),
          });
          logAgentEnd(sessionId, answerContent, iteration, true);

          yield { type: "answer", data: { sessionId, answer: answerContent, totalIterations: iteration, tokenUsage } };
          return;
        }

        // Process tool calls
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== "function") continue;
          const toolName = toolCall.function.name;
          let toolInput: unknown;
          try {
            toolInput = JSON.parse(toolCall.function.arguments);
          } catch {
            toolInput = toolCall.function.arguments;
          }
          // Handle double-encoded JSON (LLM sometimes wraps large payloads in a string)
          if (typeof toolInput === 'string') {
            try { toolInput = JSON.parse(toolInput as string); } catch { /* keep as-is */ }
          }

          const thought = typeof assistantMessage.content === "string"
            ? assistantMessage.content
            : null;

          // Emit step event before tool execution
          yield { type: "step", data: { iteration, thought, action: "tool_call", toolName, toolInput } };

          const toolResult = await this.executeTool(toolName, toolInput);

          logAgentStep({
            iteration,
            thought,
            action: "tool_call",
            toolName,
            toolInput,
            result: toolResult.output,
            timestamp: new Date().toISOString(),
          });

          // Emit tool result
          yield { type: "tool_result", data: { iteration, toolName, result: toolResult } };

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: typeof toolResult.output === "string"
              ? toolResult.output
              : JSON.stringify(toolResult.output),
          });
        }
      }

      // Max iterations reached without final answer
      logAgentEnd(sessionId, null, iteration, false);
      yield { type: "answer", data: { sessionId, answer: null, totalIterations: iteration, tokenUsage } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", data: { message } };
    }
  }

  /** Execute a single tool with timeout and safety checks. */
  private async executeTool(name: string, input: unknown): Promise<ToolResult> {
    const start = performance.now();

    // Safety: only registered tools can be called
    const tool = this.registry.get(name);
    if (!tool) {
      const result: ToolResult = {
        toolName: name,
        input,
        output: null,
        latencyMs: performance.now() - start,
        success: false,
        error: `Tool "${name}" is not registered.`,
      };
      logToolExecution(result);
      return result;
    }

    // Validate input against the tool's JSON Schema before execution
    const validation = validateToolInput(input, tool.inputSchema);
    if (!validation.valid) {
      const result: ToolResult = {
        toolName: name,
        input,
        output: null,
        latencyMs: performance.now() - start,
        success: false,
        error: `Invalid input for tool "${name}": ${validation.errors.join("; ")}`,
      };
      logToolExecution(result);
      return result;
    }

    // Execute with timeout + retry for transient network errors
    const MAX_RETRIES = 2;
    const BACKOFF_MS = [300, 600] as const;
    let lastError = "unknown error";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Exponential backoff before retry
        await new Promise<void>((resolve) => setTimeout(resolve, BACKOFF_MS[attempt - 1]));
      }

      try {
        const output = await Promise.race([
          tool.execute(input),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${this.config.toolTimeoutMs}ms`)), this.config.toolTimeoutMs)
          ),
        ]);

        const result: ToolResult = {
          toolName: name,
          input,
          output,
          latencyMs: performance.now() - start,
          success: true,
        };
        logToolExecution(result);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        // Only retry on transient network errors; never retry our own timeout or permanent failures
        if (!this.isTransientError(lastError) || attempt === MAX_RETRIES) {
          break;
        }
      }
    }

    const result: ToolResult = {
      toolName: name,
      input,
      output: null,
      latencyMs: performance.now() - start,
      success: false,
      error: lastError,
    };
    logToolExecution(result);
    return result;
  }

  /**
   * Returns true for transient network errors that are safe to retry.
   * Never retries our own tool timeout or permanent failures (validation, not-found).
   */
  private isTransientError(message: string): boolean {
    if (message.includes("timed out after") && message.includes("ms")) return false;
    return /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed|socket hang up|getaddrinfo/i.test(message);
  }
}
