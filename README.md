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

Open [http://localhost:3000](http://localhost:3000)

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

## Deploy to Vercel

```bash
npm run build
vercel --prod
```

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
