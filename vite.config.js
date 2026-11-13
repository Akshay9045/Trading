import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'
import zlib from 'zlib'
import { configureGroww, growwGet } from './server/groww.js'
import { nseDailyCandles } from './server/nseHistory.js'
import { longHistory } from './server/history.js'
import { configureTrading, tradingMiddleware, startTrading } from './server/trading.js'

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── Cookie jar helpers ────────────────────────────────────────────────────
function makeCookieStr(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}
function saveCookies(jar, headers) {
  const h = headers['set-cookie']
  if (!h) return
  const arr = Array.isArray(h) ? h : [h]
  arr.forEach(c => {
    const [nv] = c.split(';')
    const eq = nv.indexOf('=')
    if (eq > 0) jar[nv.slice(0, eq).trim()] = nv.slice(eq + 1).trim()
  })
}

// ── Generic HTTPS GET with gzip support ───────────────────────────────────
function httpsGet(options) {
  return new Promise((resolve, reject) => {
    const req = https.get({ ...options, headers: { 'Accept-Encoding': 'gzip, deflate', ...options.headers } }, res => {
      saveCookies(options._jar || {}, res.headers)
      const encoding = res.headers['content-encoding']
      let stream = res
      if (encoding === 'gzip')    stream = res.pipe(zlib.createGunzip())
      if (encoding === 'deflate') stream = res.pipe(zlib.createInflate())
      let data = ''
      stream.on('data', c => (data += c))
      stream.on('end', () => resolve({ data, status: res.statusCode, headers: res.headers }))
      stream.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(options._timeout || 8000, () => { req.destroy(); reject(new Error('timeout')) })
    req.end()
  })
}

// Map app symbols → Groww trading_symbol
const GROWW_SYMBOL = { NIFTY: 'NIFTY', BANKNIFTY: 'BANKNIFTY' }

// Timeframe → Groww candle interval (minutes) and how many days of history to pull
const GROWW_INTERVAL = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1D': 1440, '1W': 1440 }
const GROWW_DAYS     = { '1m': 3, '5m': 10, '15m': 20, '1h': 60, '1D': 400, '1W': 400 }

// Groww expects exchange-local time (IST), not UTC — shift +5:30 before formatting
const growwFmtTime = (d) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')

// ── NSE India session ─────────────────────────────────────────────────────
const nseJar = {}
let nseCache = { data: null, ts: 0 }
let nseReady = false

async function refreshNSEData() {
  const now = Date.now()
  if (nseCache.data && now - nseCache.ts < 25000) return nseCache.data  // fresh enough

  const r = await httpsGet({
    hostname: 'www.nseindia.com',
    path: '/api/allIndices',
    _jar: nseJar,
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'application/json, */*',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Referer': 'https://www.nseindia.com/',
      'Cookie': makeCookieStr(nseJar),
    },
  })

  if (r.status === 200) {
    const parsed = JSON.parse(r.data)
    nseCache = { data: parsed, ts: now }
    return parsed
  }

  // Session expired — re-init
  throw new Error(`NSE returned ${r.status}`)
}

async function initNSESession() {
  try {
    // Hit homepage to get fresh cookies — short timeout on init so server starts fast
    const home = await httpsGet({
      hostname: 'www.nseindia.com',
      path: '/',
      _jar: nseJar,
      _timeout: 5000,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,*/*',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    })
    saveCookies(nseJar, home.headers)

    // Now fetch index data
    const d = await refreshNSEData()
    const nifty = d?.data?.find(x => x.index === 'NIFTY 50')
    nseReady = true
    console.log(`\x1b[32m[NSE India]\x1b[0m Session ready — NIFTY 50: ₹${nifty?.last ?? '?'}`)
  } catch (e) {
    console.warn('\x1b[33m[NSE India]\x1b[0m Init failed:', e.message, '— retry in 30s')
    setTimeout(initNSESession, 30_000)
  }
}

// ── Yahoo Finance session (for historical candles) ────────────────────────
const yfJar = {}
let yfCrumb = null

async function initYFSession() {
  try {
    const fc = await httpsGet({
      hostname: 'fc.yahoo.com', path: '/', _jar: yfJar, _timeout: 5000,
      headers: { 'User-Agent': BROWSER_UA },
    })
    saveCookies(yfJar, fc.headers)
    if (fc.status === 429) { setTimeout(initYFSession, 10 * 60_000); return }

    const cr = await httpsGet({
      hostname: 'query2.finance.yahoo.com', path: '/v1/test/getcrumb', _jar: yfJar,
      headers: { 'User-Agent': BROWSER_UA, 'Cookie': makeCookieStr(yfJar), 'Accept': '*/*', 'Referer': 'https://finance.yahoo.com/' },
    })
    saveCookies(yfJar, cr.headers)
    if (cr.status === 200 && cr.data && !cr.data.startsWith('<')) {
      yfCrumb = cr.data.trim()
      console.log('\x1b[32m[Yahoo Finance]\x1b[0m Session ready — chart history active')
    } else {
      setTimeout(initYFSession, 10 * 60_000)
    }
  } catch (e) {
    console.warn('\x1b[33m[Yahoo Finance]\x1b[0m Session failed:', e.message)
  }
}

// ── Vite plugin ───────────────────────────────────────────────────────────
const marketPlugin = {
  name: 'market-data',
  configureServer(server) {
    // Serve NSE data via custom middleware (avoids HTTP/2 proxy issues)
    server.middlewares.use('/api/nse-data', async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-cache')
      try {
        const d = await refreshNSEData()
        const rows = d?.data || []
        const pick = (name) => {
          const r = rows.find(x => x.index === name)
          if (!r) return null
          return {
            price:         r.last,
            change:        r.variation,
            changePercent: r.percentChange,
            open:          r.open,
            high:          r.high,
            low:           r.low,
            prevClose:     r.previousClose,
            yearHigh:      r.yearHigh,
            yearLow:       r.yearLow,
          }
        }
        res.end(JSON.stringify({
          NIFTY:    pick('NIFTY 50'),
          BANKNIFTY:pick('NIFTY BANK'),
          VIX:      pick('INDIA VIX'),
          SENSEX:   null,   // SENSEX is a BSE index — not on NSE allIndices. Quote path uses Yahoo ^BSESN instead of faking it with NIFTY data.
          ts:       Date.now(),
        }))
      } catch (e) {
        res.statusCode = 503
        res.end(JSON.stringify({ error: e.message }))
      }
    })

    // ── Groww: long candle history for research/backtests (chunked, disk-cached) ──
    server.middlewares.use('/api/groww/history', async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-cache')
      try {
        const url    = new URL(req.originalUrl, 'http://localhost')
        const symbol = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
        const tf     = url.searchParams.get('tf') || '15m'
        const days   = Math.min(Math.max(Number(url.searchParams.get('days')) || 365, 1), 6 * 365)
        res.end(JSON.stringify({ symbol, tf, candles: await longHistory(symbol, tf, days) }))
      } catch (e) {
        res.statusCode = 502
        res.end(JSON.stringify({ error: e.message }))
      }
    })

    // ── NSE: daily index candles (fallback when Groww and Yahoo refuse) ────
    server.middlewares.use('/api/nse-history', async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-cache')
      try {
        const url    = new URL(req.originalUrl, 'http://localhost')
        const symbol = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
        res.end(JSON.stringify({ symbol, candles: await nseDailyCandles(symbol) }))
      } catch (e) {
        res.statusCode = 502
        res.end(JSON.stringify({ error: e.message }))
      }
    })

    // ── Groww: historical candles ─────────────────────────────────────────
    server.middlewares.use('/api/groww/candles', async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-cache')
      try {
        const url      = new URL(req.originalUrl, 'http://localhost')
        const symbol   = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
        const tf       = url.searchParams.get('tf') || '1D'
        const sym      = GROWW_SYMBOL[symbol]
        if (!sym) throw new Error(`No Groww symbol for ${symbol}`)
        const interval = GROWW_INTERVAL[tf] || 15
        const days     = GROWW_DAYS[tf] || 20
        const end      = new Date()
        const start    = new Date(end.getTime() - days * 24 * 3600 * 1000)
        const path = `/v1/historical/candle/range?exchange=NSE&segment=CASH&trading_symbol=${encodeURIComponent(sym)}`
          + `&start_time=${encodeURIComponent(growwFmtTime(start))}&end_time=${encodeURIComponent(growwFmtTime(end))}`
          + `&interval_in_minutes=${interval}`
        const j = await growwGet(path)
        const candles = (j.payload?.candles || [])
          .map(c => ({ time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] || 0 }))
          .filter(c => c.close > 0)
        res.end(JSON.stringify({ symbol, candles }))
      } catch (e) {
        res.statusCode = 502
        res.end(JSON.stringify({ error: e.message }))
      }
    })

    // ── Groww: option chain (OI / IV / Greeks per strike) ─────────────────
    server.middlewares.use('/api/groww/option-chain', async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-cache')
      try {
        const url    = new URL(req.originalUrl, 'http://localhost')
        const symbol = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
        const expiry = url.searchParams.get('expiry')   // YYYY-MM-DD
        const sym    = GROWW_SYMBOL[symbol]
        if (!sym) throw new Error(`No Groww symbol for ${symbol}`)
        if (!expiry) throw new Error('expiry (YYYY-MM-DD) is required')
        const j = await growwGet(`/v1/option-chain/exchange/NSE/underlying/${encodeURIComponent(sym)}?expiry_date=${expiry}`)
        res.end(JSON.stringify(j.payload || j))
      } catch (e) {
        res.statusCode = 502
        res.end(JSON.stringify({ error: e.message }))
      }
    })

    // ── Groww: live quote + India VIX ─────────────────────────────────────
    server.middlewares.use('/api/groww/quote', async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-cache')
      try {
        const url    = new URL(req.originalUrl, 'http://localhost')
        const symbol = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
        const sym    = GROWW_SYMBOL[symbol]
        if (!sym) throw new Error(`No Groww symbol for ${symbol}`)
        const [q, ltp] = await Promise.all([
          growwGet(`/v1/live-data/quote?exchange=NSE&segment=CASH&trading_symbol=${encodeURIComponent(sym)}`),
          growwGet(`/v1/live-data/ltp?segment=CASH&exchange_symbols=NSE_${sym},NSE_INDIAVIX`).catch(() => null),
        ])
        const p = q.payload || {}
        res.end(JSON.stringify({
          symbol,
          ltp:           ltp?.payload?.[`NSE_${sym}`] ?? p.last_price ?? null,
          ohlc:          p.ohlc || null,
          dayChange:     p.day_change ?? null,
          dayChangePerc: p.day_change_perc ?? null,
          vix:           ltp?.payload?.NSE_INDIAVIX ?? null,
        }))
      } catch (e) {
        res.statusCode = 502
        res.end(JSON.stringify({ error: e.message }))
      }
    })

    // ── Order placement, positions, funds (paper + live Groww) ────────────
    server.middlewares.use('/api/trade', tradingMiddleware)

    initNSESession()
    initYFSession()
    startTrading()
    setInterval(() => refreshNSEData().catch(() => {}), 30_000)
    setInterval(initNSESession, 20 * 60_000)
    setInterval(initYFSession,  25 * 60_000)
  },
}

export default defineConfig(({ mode }) => {
  // Load .env (all vars, no prefix filter) so server-side Groww creds are available
  const env = loadEnv(mode, process.cwd(), '')
  configureGroww({ apiKey: env.GROWW_API_KEY, secret: env.GROWW_API_SECRET, totpToken: env.GROWW_TOTP_TOKEN, totpSecret: env.GROWW_TOTP_SECRET })
  configureTrading(env)

  return {
  plugins: [react(), marketPlugin],

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['lightweight-charts'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },

  server: {
    port: 5174,
    proxy: {
      // Yahoo Finance — historical OHLCV candle data
      '/api/yahoo': {
        target: 'https://query2.finance.yahoo.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/yahoo/, ''),
        configure: proxy => {
          proxy.on('proxyReq', proxyReq => {
            proxyReq.setHeader('User-Agent', BROWSER_UA)
            proxyReq.setHeader('Accept', 'application/json, */*')
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9')
            proxyReq.setHeader('Referer', 'https://finance.yahoo.com/')
            const c = makeCookieStr(yfJar)
            if (c) proxyReq.setHeader('Cookie', c)
            if (yfCrumb) {
              const sep = proxyReq.path.includes('?') ? '&' : '?'
              proxyReq.path = `${proxyReq.path}${sep}crumb=${encodeURIComponent(yfCrumb)}`
            }
          })
          proxy.on('proxyRes', proxyRes => saveCookies(yfJar, proxyRes.headers))
        },
      },

      '/api/claude': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/api\/claude/, ''),
      },
    },
  },
  }
})
