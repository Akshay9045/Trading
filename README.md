# NIFTY Terminal — AI-Powered Trading Dashboard

A professional, real-time trading terminal focused on NIFTY 50 with AI-powered signals, technical analysis, and market intelligence.

## Features

- **Real-time Market Data** — NIFTY 50, BANKNIFTY, SENSEX, India VIX
- **Interactive Charts** — TradingView Lightweight Charts with candlesticks
- **Technical Indicators** — RSI, MACD, EMA (9/20/50/200), Bollinger Bands, StochRSI
- **AI Signal Engine** — Buy/Sell/Hold with entry, target, stop loss, confidence %
- **AI Predictions** — Bullish/bearish probability, Fear & Greed Index
- **Market Sentiment** — Breadth, FII/DII, sector heatmap, options data
- **Watchlist** — Track and analyze individual stocks
- **Signal History** — Full history with P&L tracking

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5174](http://localhost:5174)

## API Setup (Optional — runs in Demo Mode without keys)

Copy `.env.example` to `.env` and add your API keys:

```env
VITE_TWELVE_DATA_API_KEY=your_key_here   # Free at twelvedata.com
VITE_USE_MOCK_DATA=false                  # Set to false to use real API
```

### Free API Sources
| Provider | Free Tier | Link |
|----------|-----------|------|
| Twelve Data | 800 credits/day | https://twelvedata.com |
| Alpha Vantage | 25 req/day | https://alphavantage.co |
| Finnhub | 60 calls/min | https://finnhub.io |

## Tech Stack

- **React 18** + Vite 5
- **TradingView Lightweight Charts** — candlestick charts
- **Framer Motion** — animations
- **Tailwind CSS** — styling with custom dark theme
- **Lucide React** — icons

## Deploy: Netlify (website) + Railway (API)

The website is static and goes on Netlify. Everything under `/api` (Groww, NSE,
AI, orders, paper account) is a small Node server in `server/` that runs on Railway.
Netlify forwards `/api/*` to Railway, so the browser only talks to the Netlify site.

```
Browser ──▶ Netlify (dist/)  ──/api/*──▶  Railway: node server/index.js  (+ volume at /data)
```

**Railway** — New service → GitHub repo → this repo (builds `Dockerfile`, uses `railway.json`):
1. Variables: `APP_PASSWORD` (required), `GROWW_API_KEY`, `GROWW_API_SECRET` (or the
   `GROWW_TOTP_*` pair), `GROQ_API_KEY`, `TRADING_LIVE_ENABLED=false`, the `TRADE_*`
   limits, and `ALLOWED_ORIGINS=https://<your-site>.netlify.app`
2. Add a volume mounted at `/data` (paper account, caches, order brackets)
3. Networking → Generate domain → copy the `https://….up.railway.app` URL

**Netlify** — Add new site → import this repo (reads `netlify.toml`):
1. Environment variable `API_ORIGIN` = the Railway URL from step 3
2. Deploy. Open the site and sign in with `APP_PASSWORD`.

Run the production server locally: `npm run build && APP_PASSWORD=test npm start` → http://localhost:8080

## Project Structure

```
src/
├── components/
│   ├── layout/       # Sidebar, Navbar, Layout
│   ├── charts/       # CandlestickChart
│   ├── signals/      # SignalCard, SignalTable
│   ├── indicators/   # Technical indicator panels
│   ├── market/       # IndexCard, TopMovers
│   ├── ai/           # PredictionMeter, FearGreed
│   ├── watchlist/    # Watchlist component
│   └── ui/           # GlassCard, Badge, Skeleton, etc
├── pages/            # Dashboard, Charts, Signals, AI, Sentiment, Watchlist
├── services/         # API service, signal engine, mock data
├── hooks/            # useMarketData, useRealtimeQuote
├── utils/            # Technical indicator calculations, formatters
└── context/          # AppContext (global state)
```
