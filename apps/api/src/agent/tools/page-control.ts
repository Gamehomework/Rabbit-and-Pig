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

// ── Export all page control tools as an array ────────────────────────

export const pageControlTools: Tool[] = [
  setChartRangeTool,
  addPriceLevelTool,
  filterNewsTool,
  scrollToSectionTool,
  prefillNoteTool,
  navigateToTool,
];

