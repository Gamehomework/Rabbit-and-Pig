# 🐰🐷 Rabbit and Pig

An AI-powered stock research assistant that combines real-time market data, interactive charts, news aggregation, and a conversational AI agent — all in one place.

## Features

- **AI Chat Assistant** — Ask questions in natural language; the AI agent fetches quotes, draws indicators, filters news, and controls the entire UI for you
- **Interactive Stock Charts** — Candlestick charts powered by [Lightweight Charts](https://github.com/nicehash/lightweight-charts) with real-time 60-second polling and incremental updates (no flicker)
- **Technical Indicators** — AI-driven SMA, EMA, Bollinger Bands, and more — calculated server-side and overlaid on charts
- **News & Sentiment** — Aggregated news with AI-powered filtering and sentiment analysis
- **Price Alerts** — Set alerts via the UI or ask the AI; get notified through Twilio SMS
- **Portfolio Analytics** — Visualize portfolio performance with Recharts
- **Plugin System** — Extend the agent with custom tools at runtime
- **Notes** — Keep research notes per stock, pre-filled by AI suggestions

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | [Next.js 15](https://nextjs.org/) · React 19 · Tailwind CSS 4 |
| Backend | [Fastify 5](https://fastify.dev/) · TypeScript |
| AI | [OpenAI SDK](https://github.com/openai/openai-node) · ReAct Agent with tool-use |
| Database | SQLite via [Drizzle ORM](https://orm.drizzle.team/) |
| Market Data | [Yahoo Finance](https://github.com/nicehash/yahoo-finance2) |
| Notifications | [Twilio](https://www.twilio.com/) |
| Monorepo | [Turborepo](https://turbo.build/) · pnpm workspaces |

## Project Structure

```
rabbit-and-pig/
├── apps/
│   ├── web/          # Next.js frontend (port 3002)
│   └── api/          # Fastify API server
├── packages/
│   └── shared/       # Shared types, constants & utilities
├── turbo.json        # Turborepo pipeline config
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- **Node.js** ≥ 22
- **pnpm** ≥ 9.15

### Installation

```bash
git clone https://github.com/Gamehomework/Rabbit-and-Pig.git
cd Rabbit-and-Pig
pnpm install
```

### Environment Variables

Create `apps/api/.env`:

```env
OPENAI_API_KEY=sk-...        # Required — powers the AI agent
TWILIO_ACCOUNT_SID=...       # Optional — for SMS alerts
TWILIO_AUTH_TOKEN=...         # Optional — for SMS alerts
TWILIO_FROM_NUMBER=...       # Optional — for SMS alerts
```

### Development

```bash
# Start both frontend & backend in dev mode
pnpm dev
```

- **Web** → [http://localhost:3002](http://localhost:3002)
- **API** → [http://localhost:3000](http://localhost:3000)

### Build

```bash
pnpm build
```

### Database Migrations

```bash
cd apps/api
pnpm db:generate   # Generate migration files
pnpm db:migrate    # Apply migrations
```

## AI Agent Architecture

The assistant uses a **ReAct (Reason + Act)** loop powered by OpenAI function calling:

1. User sends a natural-language message
2. The agent reasons about which tools to invoke
3. Tools execute server-side (fetch quote, calculate indicators, crawl URL, etc.)
4. Results are returned with optional **page commands** that control the frontend UI
5. A **PageCommandBus** on the client dispatches commands to the appropriate components

Available agent tools include: `get_quote`, `get_news`, `draw_indicators`, `calc_risk`, `get_financials`, `crawl_url`, `set_chart_range`, `filter_news`, `send_message`, and more.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Lint the entire monorepo |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm clean` | Remove build artifacts |

## License

[MIT](./LICENSE) © 2026 Gamehomework

