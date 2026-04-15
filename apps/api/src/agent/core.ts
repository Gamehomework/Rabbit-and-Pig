/**
 * Agent Core: ReAct execution loop using DeepSeek API (OpenAI-compatible).
 *
 * Flow: receive query → LLM plans → parse action → execute tool → observe → repeat
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions.js";
import { ToolRegistry } from "./tools/registry.js";
import type { ToolResult } from "./tools/types.js";
import {
  logAgentStep,
  logToolExecution,
  logAgentStart,
  logAgentEnd,
} from "./logger.js";
import { callWithRetry } from "./llm-client.js";
import { DEFAULT_SYSTEM_PROMPT } from "./prompts/system.js";

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
}

/** A single step in the agent execution trace */
export interface AgentStep {
  iteration: number;
  thought: string | null;
  toolCall: { name: string; input: unknown } | null;
  toolResult: ToolResult | null;
}

/** Reason why the agent stopped executing */
export type StoppedReason = "complete" | "max_iterations" | "no_response";

/** Result of a complete agent run */
export interface AgentRunResult {
  sessionId: string;
  query: string;
  finalAnswer: string | null;
  steps: AgentStep[];
  totalIterations: number;
  success: boolean;
  stoppedReason: StoppedReason;
}

/** Processed tool call with parsed input */
interface ParsedToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** Result of processing a batch of tool calls */
interface ProcessedToolResult {
  steps: AgentStep[];
  messages: ChatCompletionMessageParam[];
}

/** Events emitted during streaming agent execution */
export type AgentStreamEvent =
  | { type: "step"; data: { iteration: number; thought: string | null; action: "thought" | "tool_call"; toolName?: string; toolInput?: unknown } }
  | { type: "tool_result"; data: { iteration: number; toolName: string; result: ToolResult } }
  | { type: "answer"; data: { sessionId: string; answer: string | null; totalIterations: number; stoppedReason: StoppedReason } }
  | { type: "error"; data: { message: string } };

// Re-export for backward compatibility
export { DEFAULT_SYSTEM_PROMPT } from "./prompts/system.js";

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL = "deepseek-chat";

export class Agent {
  private client: OpenAI;
  private registry: ToolRegistry;
  private config: Required<AgentConfig>;

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
    };
  }

  // ── Shared helpers (Task 1: eliminate duplication) ──────────────────

  /** Parse tool call arguments, handling double-encoded JSON from LLMs. */
  private parseToolInput(rawArguments: string): unknown {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      parsed = rawArguments;
    }
    // Handle double-encoded JSON (LLM sometimes wraps large payloads in a string)
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { /* keep as-is */ }
    }
    return parsed;
  }

  /** Parse raw tool_calls into a normalized array. */
  private parseToolCalls(toolCalls: ChatCompletionMessageToolCall[]): ParsedToolCall[] {
    return toolCalls
      .filter((tc) => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: this.parseToolInput(tc.function.arguments),
      }));
  }

  /** Execute all tool calls in parallel and return steps + messages. */
  private async processToolCalls(
    parsed: ParsedToolCall[],
    iteration: number,
    thought: string | null,
  ): Promise<ProcessedToolResult> {
    // Execute all tools in parallel (Task 4)
    const results = await Promise.all(
      parsed.map((tc) => this.executeTool(tc.name, tc.input)),
    );

    const steps: AgentStep[] = [];
    const messages: ChatCompletionMessageParam[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const tc = parsed[i];
      const toolResult = results[i];

      steps.push({
        iteration,
        thought,
        toolCall: { name: tc.name, input: tc.input },
        toolResult,
      });

      logAgentStep({
        iteration,
        thought,
        action: "tool_call",
        toolName: tc.name,
        toolInput: tc.input,
        result: toolResult.output,
        timestamp: new Date().toISOString(),
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: typeof toolResult.output === "string"
          ? toolResult.output
          : JSON.stringify(toolResult.output),
      });
    }

    return { steps, messages };
  }

  /** Call the LLM with retry logic. */
  private async callLLM(
    messages: ChatCompletionMessageParam[],
    tools: ReturnType<ToolRegistry["toFunctionDefinitions"]>,
  ) {
    return callWithRetry(() =>
      this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      }),
    );
  }

  // ── Public API ─────────────────────────────────────────────────────

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
    let stoppedReason: StoppedReason = "max_iterations";
    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      iteration++;

      const response = await this.callLLM(messages, tools);
      const choice = response.choices[0];
      if (!choice) {
        stoppedReason = "no_response";
        break;
      }

      const assistantMessage = choice.message;
      messages.push(assistantMessage as ChatCompletionMessageParam);

      // If no tool calls, the LLM has produced a final answer
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        finalAnswer = typeof assistantMessage.content === "string"
          ? assistantMessage.content
          : null;
        stoppedReason = "complete";
        steps.push({
          iteration,
          thought: finalAnswer,
          toolCall: null,
          toolResult: null,
        });
        logAgentStep({
          iteration,
          thought: finalAnswer,
          action: "final_answer",
          toolName: null,
          toolInput: null,
          result: finalAnswer,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      // Process tool calls via shared helper
      const thought = typeof assistantMessage.content === "string"
        ? assistantMessage.content
        : null;
      const parsed = this.parseToolCalls(assistantMessage.tool_calls);
      const processed = await this.processToolCalls(parsed, iteration, thought);
      steps.push(...processed.steps);
      messages.push(...processed.messages);
    }

    const success = stoppedReason === "complete" && finalAnswer !== null;
    logAgentEnd(sessionId, finalAnswer, iteration, success);

    return {
      sessionId,
      query,
      finalAnswer,
      steps,
      totalIterations: iteration,
      success,
      stoppedReason,
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

    try {
      while (iteration < this.config.maxIterations) {
        iteration++;

        const response = await this.callLLM(messages, tools);
        const choice = response.choices[0];
        if (!choice) {
          logAgentEnd(sessionId, null, iteration, false);
          yield { type: "answer", data: { sessionId, answer: null, totalIterations: iteration, stoppedReason: "no_response" } };
          return;
        }

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

          yield { type: "answer", data: { sessionId, answer: answerContent, totalIterations: iteration, stoppedReason: "complete" } };
          return;
        }

        // Process tool calls via shared helpers
        const thought = typeof assistantMessage.content === "string"
          ? assistantMessage.content
          : null;
        const parsed = this.parseToolCalls(assistantMessage.tool_calls);

        // Emit step events before execution
        for (const tc of parsed) {
          yield { type: "step", data: { iteration, thought, action: "tool_call", toolName: tc.name, toolInput: tc.input } };
        }

        const processed = await this.processToolCalls(parsed, iteration, thought);

        // Emit tool results
        for (let i = 0; i < parsed.length; i++) {
          yield { type: "tool_result", data: { iteration, toolName: parsed[i].name, result: processed.steps[i].toolResult! } };
        }

        messages.push(...processed.messages);
      }

      // Max iterations reached without final answer
      logAgentEnd(sessionId, null, iteration, false);
      yield { type: "answer", data: { sessionId, answer: null, totalIterations: iteration, stoppedReason: "max_iterations" } };
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

    try {
      // Execute with timeout
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
      const error = err instanceof Error ? err.message : String(err);
      const result: ToolResult = {
        toolName: name,
        input,
        output: null,
        latencyMs: performance.now() - start,
        success: false,
        error,
      };
      logToolExecution(result);
      return result;
    }
  }
}
