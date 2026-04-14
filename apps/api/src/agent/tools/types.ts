/**
 * Tool interface and result types for the agent tool system.
 */

/** JSON Schema type for tool input validation */
export interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
  [key: string]: unknown;
}

/** Generic tool interface */
export interface Tool<TInput = unknown, TOutput = unknown> {
  /** Unique tool name */
  name: string;
  /** Human-readable description for LLM context */
  description: string;
  /** JSON Schema describing the input */
  inputSchema: JsonSchema;
  /** Execute the tool with validated input */
  execute(input: TInput): Promise<TOutput>;
}

/** Result of a tool execution */
export interface ToolResult {
  toolName: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  success: boolean;
  error?: string;
}

/** OpenAI-compatible function definition (used by DeepSeek) */
export interface FunctionDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

