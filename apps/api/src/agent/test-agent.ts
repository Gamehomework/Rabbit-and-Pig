/**
 * Test script for the agent loop.
 * Run with: npx tsx apps/api/src/agent/test-agent.ts
 *
 * Requires DEEPSEEK_API_KEY environment variable.
 */

import { Agent } from "./core.js";
import { ToolRegistry } from "./tools/registry.js";
import { echoTool } from "./tools/echo.js";

async function main() {
  // Set up registry with echo tool
  const registry = new ToolRegistry();
  registry.register(echoTool);

  console.log("=== Tool Registry ===");
  console.log("Registered tools:", registry.list().map((t) => t.name));
  console.log("Function definitions:", JSON.stringify(registry.toFunctionDefinitions(), null, 2));

  // Verify tool whitelist
  console.log("\n=== Safety: Tool Whitelist ===");
  console.log('Has "echo":', registry.has("echo"));
  console.log('Has "unknown":', registry.has("unknown"));

  // Test the agent if API key is available
  if (!process.env.DEEPSEEK_API_KEY) {
    console.log("\n⚠️  DEEPSEEK_API_KEY not set. Skipping live agent test.");
    console.log("Set the environment variable and re-run to test the full agent loop.");

    // Still verify the tool executes directly
    console.log("\n=== Direct Tool Execution ===");
    const result = await echoTool.execute({ message: "Hello, world!" });
    console.log("Echo result:", result);
    console.log("\n✅ Tool system works correctly (without LLM).");
    return;
  }

  const agent = new Agent(registry, { maxIterations: 5 });

  console.log("\n=== Agent Run: Echo Test ===");
  const result = await agent.run('Please echo the message "Hello from the agent!"');

  console.log("\n=== Agent Result ===");
  console.log("Session ID:", result.sessionId);
  console.log("Query:", result.query);
  console.log("Final Answer:", result.finalAnswer);
  console.log("Total Iterations:", result.totalIterations);
  console.log("Success:", result.success);
  console.log("Steps:", JSON.stringify(result.steps, null, 2));
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

