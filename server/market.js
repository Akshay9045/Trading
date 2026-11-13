// ── Market-data routes: NSE quotes, Groww candles/option chain/quote, history,
// Yahoo proxy. Shared by the Vite dev server and the production server (index.js).
import https from 'https'
import zlib from 'zlib'
import { growwGet } from './groww.js'
import { nseDailyCandles } from './nseHistory.js'
import { longHistory } from './history.js'

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

// /api/yahoo/<path> → query2.finance.yahoo.com/<path> with session cookie + crumb.
// Read-only chart data; only /v8/finance/chart/* is forwarded.
async function yahooProxy(req, res, url) {
  const upstream = url.pathname.replace(/^\/api\/yahoo/, '')
  if (!upstream.startsWith('/v8/finance/chart/')) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' })); return }
  const qs = new URLSearchParams(url.search)
  if (yfCrumb) qs.set('crumb', yfCrumb)
  const r = await httpsGet({
    hostname: 'query2.finance.yahoo.com', path: `${upstream}?${qs}`, _jar: yfJar, _timeout: 12000,
    headers: {
      'User-Agent': BROWSER_UA, 'Accept': 'application/json, */*', 'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com/', 'Cookie': makeCookieStr(yfJar),
    },
  })
  res.statusCode = r.status
  res.end(r.data)
}

// ── Route handlers: (url) → JSON-able result; throw → 502 { error } ───────
const nseData = async () => {
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
  return {
    NIFTY:    pick('NIFTY 50'),
    BANKNIFTY:pick('NIFTY BANK'),
    VIX:      pick('INDIA VIX'),
    SENSEX:   null,   // SENSEX is a BSE index — not on NSE allIndices. Quote path uses Yahoo ^BSESN instead of faking it with NIFTY data.
    ts:       Date.now(),
  }
}

const growwHistory = async (url) => {
  const symbol = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
  const tf     = url.searchParams.get('tf') || '15m'
  const days   = Math.min(Math.max(Number(url.searchParams.get('days')) || 365, 1), 6 * 365)
  return { symbol, tf, candles: await longHistory(symbol, tf, days) }
}

const nseHistory = async (url) => {
  const symbol = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
  return { symbol, candles: await nseDailyCandles(symbol) }
}

const growwCandles = async (url) => {
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
  return { symbol, candles }
}

const growwOptionChain = async (url) => {
  const symbol = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
  const expiry = url.searchParams.get('expiry')   // YYYY-MM-DD
  const sym    = GROWW_SYMBOL[symbol]
  if (!sym) throw new Error(`No Groww symbol for ${symbol}`)
  if (!expiry) throw new Error('expiry (YYYY-MM-DD) is required')
  const j = await growwGet(`/v1/option-chain/exchange/NSE/underlying/${encodeURIComponent(sym)}?expiry_date=${expiry}`)
  return j.payload || j
}

const growwQuote = async (url) => {
  const symbol = (url.searchParams.get('symbol') || 'NIFTY').toUpperCase()
  const sym    = GROWW_SYMBOL[symbol]
  if (!sym) throw new Error(`No Groww symbol for ${symbol}`)
  const [q, ltp] = await Promise.all([
    growwGet(`/v1/live-data/quote?exchange=NSE&segment=CASH&trading_symbol=${encodeURIComponent(sym)}`),
    growwGet(`/v1/live-data/ltp?segment=CASH&exchange_symbols=NSE_${sym},NSE_INDIAVIX`).catch(() => null),
  ])
  const p = q.payload || {}
  return {
    symbol,
    ltp:           ltp?.payload?.[`NSE_${sym}`] ?? p.last_price ?? null,
    ohlc:          p.ohlc || null,
    dayChange:     p.day_change ?? null,
    dayChangePerc: p.day_change_perc ?? null,
    vix:           ltp?.payload?.NSE_INDIAVIX ?? null,
  }
}

// pathname → handler. `status` is the HTTP code used when the handler throws.
export const marketRoutes = {
  '/api/nse-data':           { fn: nseData, status: 503 },
  '/api/groww/history':      { fn: growwHistory },
  '/api/nse-history':        { fn: nseHistory },
  '/api/groww/candles':      { fn: growwCandles },
  '/api/groww/option-chain': { fn: growwOptionChain },
  '/api/groww/quote':        { fn: growwQuote },
}

export { yahooProxy }

// Background sessions. Vite re-imports this module when the config or .env changes,
// in the same process — clear the previous timers so they don't pile up.
export function startMarket() {
  for (const t of globalThis.__niftyMarketTimers || []) clearInterval(t)
  initNSESession()
  initYFSession()
  globalThis.__niftyMarketTimers = [
    setInterval(() => refreshNSEData().catch(() => {}), 30_000),
    setInterval(initNSESession, 20 * 60_000),
    setInterval(initYFSession,  25 * 60_000),
  ]
}
