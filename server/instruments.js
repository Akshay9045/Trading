// ── Groww instrument master (index options only) ───────────────────────────
// Groww publishes every tradable contract in a public CSV. Orders must use the
// exact `trading_symbol` from it, and lot size / tick size / freeze quantity /
// expiry dates come from here too — never computed — because NSE revises lot
// sizes and moves expiries for holidays.
import fs from 'fs'
import path from 'path'
import https from 'https'
import { dataPath } from './paths.js'

const CSV_URL   = 'https://growwapi-assets.groww.in/instruments/instrument.csv'
const CACHE_DIR = dataPath()
const CSV_PATH  = path.join(CACHE_DIR, 'groww-instruments.csv')
const MAX_AGE_MS = 12 * 3600 * 1000

export const SUPPORTED_UNDERLYINGS = ['NIFTY', 'BANKNIFTY']

const state = {
  byKey: new Map(),        // `${underlying}|${expiry}|${strike}|${CE|PE}` → contract
  bySymbol: new Map(),     // trading_symbol → contract
  expiries: {},            // underlying → ['YYYY-MM-DD', ...] sorted
  loadedAt: 0,
  loading: null,
  error: null,
}

const contractKey = (underlying, expiry, strike, type) => `${underlying}|${expiry}|${Number(strike)}|${type}`

function download() {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const tmp = `${CSV_PATH}.part`
  return new Promise((resolve, reject) => {
    const req = https.get(CSV_URL, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`instrument CSV HTTP ${res.statusCode}`)); return }
      const out = fs.createWriteStream(tmp)
      res.pipe(out)
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, CSV_PATH); resolve() }))
      out.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(60_000, () => req.destroy(new Error('instrument CSV timeout')))
  })
}

function parse() {
  const text = fs.readFileSync(CSV_PATH, 'utf8')
  const lines = text.split('\n')
  const head = lines[0].trim().split(',')
  const col = Object.fromEntries(head.map((h, i) => [h, i]))
  for (const need of ['exchange', 'trading_symbol', 'instrument_type', 'segment', 'underlying_symbol', 'expiry_date', 'strike_price', 'lot_size', 'tick_size', 'freeze_quantity']) {
    if (!(need in col)) throw new Error(`instrument CSV missing column ${need}`)
  }

  const byKey = new Map(), bySymbol = new Map(), expiries = {}
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(',')
    if (f[col.exchange] !== 'NSE' || f[col.segment] !== 'FNO') continue
    const type = f[col.instrument_type]
    if (type !== 'CE' && type !== 'PE') continue
    const underlying = f[col.underlying_symbol]
    if (!SUPPORTED_UNDERLYINGS.includes(underlying)) continue

    const c = {
      tradingSymbol: f[col.trading_symbol],
      underlying,
      expiry:        f[col.expiry_date],
      strike:        Number(f[col.strike_price]),
      type,
      lotSize:       Number(f[col.lot_size]),
      tickSize:      Number(f[col.tick_size]) || 0.05,
      freezeQty:     Number(f[col.freeze_quantity]) || Infinity,
      buyAllowed:    col.buy_allowed == null || f[col.buy_allowed] !== '0',
      sellAllowed:   col.sell_allowed == null || f[col.sell_allowed] !== '0',
    }
    byKey.set(contractKey(underlying, c.expiry, c.strike, type), c)
    bySymbol.set(c.tradingSymbol, c)
    ;(expiries[underlying] ||= new Set()).add(c.expiry)
  }
  for (const u of Object.keys(expiries)) expiries[u] = [...expiries[u]].sort()

  if (!byKey.size) throw new Error('instrument CSV had no NIFTY/BANKNIFTY options')
  Object.assign(state, { byKey, bySymbol, expiries, loadedAt: Date.now(), error: null })
  console.log(`\x1b[32m[Groww]\x1b[0m Instruments ready — ${byKey.size} index option contracts`)
}

// Load (and refresh when stale). Single-flight so concurrent callers share one download.
export async function ensureInstruments() {
  const fresh = state.loadedAt && Date.now() - state.loadedAt < MAX_AGE_MS
  if (fresh) return
  if (state.loading) return state.loading
  state.loading = (async () => {
    try {
      let age = Infinity
      try { age = Date.now() - fs.statSync(CSV_PATH).mtimeMs } catch { /* not cached yet */ }
      if (age > MAX_AGE_MS) await download()
      parse()
    } catch (e) {
      state.error = e.message
      // A stale-but-parsed copy is still better than nothing for expiries/lot sizes
      if (!state.byKey.size && fs.existsSync(CSV_PATH)) parse()
      else if (!state.byKey.size) throw e
    } finally {
      state.loading = null
    }
  })()
  return state.loading
}

const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

// Upcoming expiries (today included) for an underlying.
export async function getExpiries(underlying) {
  await ensureInstruments()
  const today = todayIST()
  return (state.expiries[underlying] || []).filter(e => e >= today)
}

export async function getContract(underlying, expiry, strike, type) {
  await ensureInstruments()
  return state.byKey.get(contractKey(underlying, expiry, strike, type)) || null
}

export async function getContractBySymbol(tradingSymbol) {
  await ensureInstruments()
  return state.bySymbol.get(tradingSymbol) || null
}

// Strikes listed for one expiry — lets the UI snap a signal's strike to a real one.
export async function getStrikes(underlying, expiry, type) {
  await ensureInstruments()
  const out = []
  for (const c of state.byKey.values()) {
    if (c.underlying === underlying && c.expiry === expiry && c.type === type) out.push(c.strike)
  }
  return out.sort((a, b) => a - b)
}

export { todayIST }
