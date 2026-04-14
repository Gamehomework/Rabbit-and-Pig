/**
 * Agent Core: ReAct execution loop using DeepSeek API (OpenAI-compatible).
 *
 * Flow: receive query → LLM plans → parse action → execute tool → observe → repeat
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { ToolRegistry } from "./tools/registry.js";
import type { ToolResult } from "./tools/types.js";
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
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful stock research assistant. You have access to tools to help answer questions. Use the tools when needed and provide clear, concise answers based on the information gathered.`;

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

    while (iteration < this.config.maxIterations) {
      iteration++;

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

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

        const toolResult = await this.executeTool(toolName, toolInput);

        const thought = typeof assistantMessage.content === "string"
          ? assistantMessage.content
          : null;

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
    };
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
