// ── Long candle history for research/backtests (Groww backtesting API) ─────
// GET /v1/historical/candles — index data from 2020. Each request may cover at most
// 30 days (≤5m), 90 days (10–30m) or 180 days (1h and up), so we walk back in
// chunks and cache completed chunks on disk: past candles never change, so a
// second run only fetches the newest chunk.
// Docs: https://groww.in/trade-api/docs/curl/backtesting
import fs from 'fs'
import path from 'path'
import { growwGet } from './groww.js'
import { dataPath } from './paths.js'

const GROWW_SYMBOL = { NIFTY: 'NSE-NIFTY', BANKNIFTY: 'NSE-BANKNIFTY' }
const INTERVALS = {                       // app timeframe → Groww interval + max days per request
  '5m':  { iv: '5minute',  maxDays: 30 },
  '15m': { iv: '15minute', maxDays: 90 },
  '1h':  { iv: '1hour',    maxDays: 180 },
  '1D':  { iv: '1day',     maxDays: 180 },
}
const CACHE_DIR = dataPath('history')
const DAY = 86400_000

// Groww wants exchange-local time (IST)
const ist = (d) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchRange(symbol, iv, from, to) {
  const qs = new URLSearchParams({
    exchange: 'NSE', segment: 'CASH', groww_symbol: GROWW_SYMBOL[symbol],
    start_time: ist(from), end_time: ist(to), candle_interval: iv,
  })
  const j = await growwGet(`/v1/historical/candles?${qs}`)
  return (j.payload?.candles || []).map(c => ({
    // "yyyy-MM-dd HH:mm:ss" IST → epoch seconds; epoch numbers pass through
    time: typeof c[0] === 'number' ? c[0] : Math.floor((Date.parse(c[0].replace(' ', 'T') + '+05:30')) / 1000),
    open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] || 0,
  })).filter(c => c.close > 0)
}

// Candles for `days` back from now, oldest first.
export async function longHistory(symbol, tf, days) {
  const spec = INTERVALS[tf]
  if (!GROWW_SYMBOL[symbol]) throw new Error(`No Groww history symbol for ${symbol}`)
  if (!spec) throw new Error(`Unsupported timeframe ${tf}`)
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  const byTime = new Map()
  const now = new Date()
  // Chunks aligned to fixed boundaries so cached files are reusable across runs
  const span = spec.maxDays * DAY
  const end = Math.ceil(now.getTime() / span) * span
  for (let t = end; t > now.getTime() - days * DAY; t -= span) {
    const from = new Date(t - span), to = new Date(t)
    const file = path.join(CACHE_DIR, `${symbol}-${tf}-${from.toISOString().slice(0, 10)}.json`)
    const complete = to.getTime() < now.getTime() - DAY   // fully in the past → cacheable
    let rows = null
    if (complete && fs.existsSync(file)) rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!rows) {
      rows = await fetchRange(symbol, spec.iv, from, new Date(Math.min(to.getTime(), now.getTime())))
      if (complete) fs.writeFileSync(file, JSON.stringify(rows))
      await sleep(250)   // the backtesting API's rate limit is undocumented — stay gentle
    }
    for (const c of rows) byTime.set(c.time, c)
  }
  const cutoff = (now.getTime() - days * DAY) / 1000
  return [...byTime.values()].filter(c => c.time >= cutoff).sort((a, b) => a.time - b.time)
}
