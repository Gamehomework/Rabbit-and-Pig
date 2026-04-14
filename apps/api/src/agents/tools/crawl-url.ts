/**
 * crawl_url tool: Fetches a URL and extracts readable article text.
 * Uses lightweight HTML-to-text extraction (no headless browser).
 */

import type { Tool } from "../../agent/tools/types.js";

export interface CrawlUrlInput {
  url: string;
}

export interface CrawlUrlOutput {
  url: string;
  title: string;
  text: string;
  byline: string | null;
  publishedDate: string | null;
  wordCount: number;
  success: boolean;
  error?: string;
}

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract title from HTML */
function extractTitle(html: string): string {
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (ogTitle) return ogTitle[1];
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) return stripHtml(titleTag[1]);
  return "";
}

/** Extract main article body — tries <article>, then <main>, then <body> */
function extractArticleText(html: string): string {
  // Try article tag first
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return stripHtml(article[1]);

  // Try main tag
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return stripHtml(main[1]);

  // Try role=main
  const roleMain = html.match(/<[^>]+role="main"[^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (roleMain) return stripHtml(roleMain[1]);

  // Fallback: extract text from body, limited
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) {
    const text = stripHtml(body[1]);
    // Limit to ~5000 chars to avoid noise
    return text.slice(0, 5000);
  }

  return stripHtml(html).slice(0, 3000);
}

/** Extract author/byline */
function extractByline(html: string): string | null {
  const meta = html.match(/<meta\s+name="author"\s+content="([^"]+)"/i);
  if (meta) return meta[1];
  const byline = html.match(/class="[^"]*byline[^"]*"[^>]*>([\s\S]*?)<\//i);
  if (byline) return stripHtml(byline[1]);
  return null;
}

/** Extract published date */
function extractDate(html: string): string | null {
  const metaDate = html.match(/<meta\s+property="article:published_time"\s+content="([^"]+)"/i)
    ?? html.match(/<time[^>]+datetime="([^"]+)"/i)
    ?? html.match(/<meta\s+name="date"\s+content="([^"]+)"/i);
  return metaDate ? metaDate[1] : null;
}

export const crawlUrlTool: Tool<CrawlUrlInput, CrawlUrlOutput> = {
  name: "crawl_url",
  description:
    "Fetch a URL and extract the article text content. Works with news sites, blog posts, and financial articles. Returns the title, cleaned text, author, and publication date.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch and extract text from.",
      },
    },
    required: ["url"],
  },

  async execute(input: CrawlUrlInput): Promise<CrawlUrlOutput> {
    const { url } = input;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StockResearchBot/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      });

      if (!response.ok) {
        return { url, title: "", text: "", byline: null, publishedDate: null, wordCount: 0, success: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      const title = extractTitle(html);
      const text = extractArticleText(html);
      const byline = extractByline(html);
      const publishedDate = extractDate(html);
      const wordCount = text.split(/\s+/).filter(Boolean).length;

      return { url, title, text, byline, publishedDate, wordCount, success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { url, title: "", text: "", byline: null, publishedDate: null, wordCount: 0, success: false, error };
    }
  },
};

