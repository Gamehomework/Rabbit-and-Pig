/**
 * Page Control Tools: pass-through tools that emit UI commands for the frontend.
 * Each tool returns a structured command object that the frontend PageCommandBus handles.
 */

import type { Tool } from "./types.js";

// ── 1. set_chart_range ──────────────────────────────────────────────

export const setChartRangeTool: Tool = {
  name: "set_chart_range",
  description: "Switch the chart time range. Use when the user asks to change the chart view or after analysis to show the most relevant timeframe.",
  inputSchema: {
    type: "object",
    properties: {
      range: {
        type: "string",
        enum: ["1d", "1mo", "3mo", "6mo", "1y"],
        description: "The time range to display on the chart.",
      },
    },
    required: ["range"],
  },
  async execute(input: { range: string }) {
    return {
      success: true,
      command: { type: "set_chart_range", range: input.range },
      message: `Chart range switched to ${input.range}.`,
    };
  },
};

// ── 2. add_price_level ──────────────────────────────────────────────

export const addPriceLevelTool: Tool = {
  name: "add_price_level",
  description: "Add a horizontal price level line on the chart (e.g. support/resistance). Use when you identify key price levels during analysis.",
  inputSchema: {
    type: "object",
    properties: {
      price: { type: "number", description: "The price value for the horizontal line." },
      label: { type: "string", description: "Label for the price level (e.g. 'Support', 'Resistance')." },
      color: { type: "string", description: "Optional CSS color for the line (e.g. '#e91e63', 'green')." },
    },
    required: ["price", "label"],
  },
  async execute(input: { price: number; label: string; color?: string }) {
    return {
      success: true,
      command: { type: "add_price_level", price: input.price, label: input.label, color: input.color },
      message: `Price level "${input.label}" added at $${input.price}.`,
    };
  },
};

// ── 3. filter_news ──────────────────────────────────────────────────

export const filterNewsTool: Tool = {
  name: "filter_news",
  description: "Filter or highlight news articles by keywords. Use when the user wants to focus on specific topics in the news list.",
  inputSchema: {
    type: "object",
    properties: {
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Keywords to filter/highlight in news headlines.",
      },
      mode: {
        type: "string",
        enum: ["filter", "highlight"],
        description: "Whether to filter (hide non-matching) or highlight (emphasize matching). Defaults to 'filter'.",
      },
    },
    required: ["keywords"],
  },
  async execute(input: { keywords: string[]; mode?: string }) {
    const mode = input.mode ?? "filter";
    return {
      success: true,
      command: { type: "filter_news", keywords: input.keywords, mode },
      message: `News ${mode === "filter" ? "filtered" : "highlighted"} by: ${input.keywords.join(", ")}.`,
    };
  },
};

// ── 4. scroll_to_section ────────────────────────────────────────────

export const scrollToSectionTool: Tool = {
  name: "scroll_to_section",
  description: "Scroll the page to a specific section. Use after completing analysis to direct the user's attention.",
  inputSchema: {
    type: "object",
    properties: {
      section: {
        type: "string",
        enum: ["chart", "news", "notes", "chat"],
        description: "The page section to scroll to.",
      },
    },
    required: ["section"],
  },
  async execute(input: { section: string }) {
    return {
      success: true,
      command: { type: "scroll_to_section", section: input.section },
      message: `Scrolled to ${input.section} section.`,
    };
  },
};

// ── 5. prefill_note ─────────────────────────────────────────────────

export const prefillNoteTool: Tool = {
  name: "prefill_note",
  description: "Pre-fill the Notes form with a title and content. Use to help the user save analysis results as a note.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "The note title to pre-fill." },
      content: { type: "string", description: "The note content to pre-fill." },
    },
    required: ["title", "content"],
  },
  async execute(input: { title: string; content: string }) {
    return {
      success: true,
      command: { type: "prefill_note", title: input.title, content: input.content },
      message: `Note form pre-filled with title "${input.title}".`,
    };
  },
};

// ── 6. navigate_to ──────────────────────────────────────────────────

export const navigateToTool: Tool = {
  name: "navigate_to",
  description: "Navigate to another page in the application. Use when the user asks to go to a different view.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        enum: ["deep-analysis", "home"],
        description: "The page to navigate to.",
      },
    },
    required: ["path"],
  },
  async execute(input: { path: string }) {
    return {
      success: true,
      command: { type: "navigate_to", path: input.path },
      message: `Navigating to ${input.path}.`,
    };
  },
};

// ── 7. add_indicator_lines ──────────────────────────────────────────

export const addIndicatorLinesTool: Tool = {
  name: "add_indicator_lines",
  description:
    "Draw technical indicator lines on the chart. Call after calc_indicator_series.",
  inputSchema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            color: { type: "string" },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  time: { type: "string" },
                  value: { type: "number" },
                },
                required: ["time", "value"],
              },
            },
          },
          required: ["title", "color", "data"],
        },
        description: "Array of line series to draw on the chart.",
      },
    },
    required: ["lines"],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute(rawInput: unknown) {
    // The LLM sometimes double-encodes the JSON for large payloads.
    // Handle: rawInput is a string OR rawInput.lines is a string.
    let parsed = rawInput as { lines: Array<{ title: string; color: string; data: Array<{ time: string; value: number }> }> };
    if (typeof rawInput === 'string') {
      try { parsed = JSON.parse(rawInput as string); } catch { /* keep */ }
    }
    if (parsed && typeof (parsed as any).lines === 'string') {
      try { parsed = { ...parsed, lines: JSON.parse((parsed as any).lines) }; } catch { /* keep */ }
    }
    const lines = parsed?.lines ?? [];
    return {
      success: true,
      command: { type: "add_indicator_lines", lines },
      message: `Added ${lines.length} indicator line(s): ${lines.map((l: any) => l.title).join(", ")}`,
    };
  },
};

// ── Export all page control tools as an array ────────────────────────

export const pageControlTools: Tool[] = [
  setChartRangeTool,
  addPriceLevelTool,
  filterNewsTool,
  scrollToSectionTool,
  prefillNoteTool,
  navigateToTool,
  addIndicatorLinesTool,
];

