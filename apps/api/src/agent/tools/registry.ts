/**
 * Tool Registry: register, list, get tools, and convert to DeepSeek function calling format.
 */

import type { Tool, FunctionDefinition } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /** Register a tool. Throws if a tool with the same name already exists. */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name. Returns undefined if not found. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** List all registered tools. */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** Check if a tool is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Unregister a tool by name. Returns true if the tool was found and removed. */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** Convert all registered tools to OpenAI-compatible function definitions (DeepSeek format). */
  toFunctionDefinitions(): FunctionDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Generate a human-readable tool description block for inclusion in system prompts.
   * Each tool is listed as `- **name**: description`.
   */
  generateToolDescriptions(): string {
    return this.list()
      .map((tool) => `- **${tool.name}**: ${tool.description}`)
      .join("\n");
  }
}

