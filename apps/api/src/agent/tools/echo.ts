/**
 * Echo tool: a simple mock tool that returns its input.
 * Used for testing the agent loop.
 */

import type { Tool } from "./types.js";

export interface EchoInput {
  message: string;
}

export interface EchoOutput {
  echo: string;
}

export const echoTool: Tool<EchoInput, EchoOutput> = {
  name: "echo",
  description: "Echoes back the provided message. Useful for testing.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The message to echo back.",
      },
    },
    required: ["message"],
  },
  async execute(input: EchoInput): Promise<EchoOutput> {
    return { echo: input.message };
  },
};

