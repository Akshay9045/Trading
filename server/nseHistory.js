// ── Daily index candles from NSE's public historical data ──────────────────
// Free fallback when Groww (needs its live-data plan) and Yahoo (rate-limits) both
// refuse. Daily only, up to the last completed session — NSE has no intraday history.
// The endpoint returns at most ~70 rows per request, so we walk back in 90-day chunks.
import { nseGet } from './prices.js'

const INDEX_NAME = { NIFTY: 'NIFTY 50', BANKNIFTY: 'NIFTY BANK' }
const PAGE = '/reports-indices-historical-index-data'
const REFERER = `https://www.nseindia.com${PAGE}`
const CHUNK_DAYS = 90
const CHUNKS = 5                     // ~300 trading days; the backtest needs 90+
const CACHE_MS = 60 * 60_000
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }

const cache = new Map()              // symbol → { ts, candles, promise }

const fmtDate = (d) => {
  const [y, m, day] = d.toISOString().slice(0, 10).split('-')
  return `${day}-${m}-${y}`
}
// '05-NOV-2026' → epoch seconds at UTC midnight, so the chart labels the right day
const parseDay = (s) => {
  const [d, m, y] = s.split('-')
  return Date.UTC(Number(y), MONTHS[m.toUpperCase()], Number(d)) / 1000
}

async function fetchChunk(index, from, to) {
  const path = `/api/historicalOR/indicesHistory?indexType=${encodeURIComponent(index)}&from=${fmtDate(from)}&to=${fmtDate(to)}`
  let r = await nseGet(path, REFERER)
  if (r.status === 401 || r.status === 403) {   // cookies expired — refresh from the report page
    await nseGet(PAGE, 'https://www.nseindia.com/').catch(() => {})
    r = await nseGet(path, REFERER)
  }
  if (r.status !== 200) throw new Error(`NSE history HTTP ${r.status}`)
  const rows = JSON.parse(r.data)?.data
  if (!Array.isArray(rows)) throw new Error('NSE history returned no rows')
  return rows
}

async function load(symbol) {
  const index = INDEX_NAME[symbol]
  const byDay = new Map()
  let to = new Date(Date.now() + 5.5 * 3600 * 1000)   // today in IST
  for (let i = 0; i < CHUNKS; i++) {
    const from = new Date(to.getTime() - CHUNK_DAYS * 86400_000)
    try {
      for (const r of await fetchChunk(index, from, to)) {
        const time = parseDay(r.EOD_TIMESTAMP)
        byDay.set(time, {
          time,
          open:   r.EOD_OPEN_INDEX_VAL,
          high:   r.EOD_HIGH_INDEX_VAL,
          low:    r.EOD_LOW_INDEX_VAL,
          close:  r.EOD_CLOSE_INDEX_VAL,
          volume: r.HIT_TRADED_QTY || 0,
        })
      }
    } catch (e) {
      if (!byDay.size) throw e        // newest chunk failed: nothing usable
      break                           // older chunk failed: keep the recent history
    }
    to = new Date(from.getTime() - 86400_000)
  }
  return [...byDay.values()].filter(c => c.close > 0).sort((a, b) => a.time - b.time)
}

export async function nseDailyCandles(symbol) {
  if (!INDEX_NAME[symbol]) throw new Error(`No NSE history for ${symbol}`)
  const hit = cache.get(symbol)
  if (hit?.candles && Date.now() - hit.ts < CACHE_MS) return hit.candles
  if (hit?.promise) return hit.promise
  const promise = load(symbol)
    .then(candles => { cache.set(symbol, { ts: Date.now(), candles }); return candles })
    .catch(e => { cache.delete(symbol); throw e })
  cache.set(symbol, { ...hit, promise })
  return promise
}
