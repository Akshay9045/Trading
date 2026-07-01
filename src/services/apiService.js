import axios from 'axios'
import { getNextExpiryISO } from './optionsEngine'

// ── Symbol maps ────────────────────────────────────────────────────────────

// NSE India index names for allIndices API
const NSE_INDEX_NAMES = {
  NIFTY:    'NIFTY 50',
  BANKNIFTY:'NIFTY BANK',
  SENSEX:   null,   // not on NSE (BSE index)
  VIX:      'INDIA VIX',
}

// Yahoo Finance symbols for historical candle data
const YF_SYMBOLS = {
  NIFTY:           '^NSEI',
  BANKNIFTY:       '^NSEBANK',
  SENSEX:          '^BSESN',
  VIX:             '^INDIAVIX',
  'RELIANCE.NSE':  'RELIANCE.NS',
  'TCS.NSE':       'TCS.NS',
  'HDFCBANK.NSE':  'HDFCBANK.NS',
  'INFY.NSE':      'INFY.NS',
  'ICICIBANK.NSE': 'ICICIBANK.NS',
  'HINDUNILVR.NSE':'HINDUNILVR.NS',
  'SBIN.NSE':      'SBIN.NS',
  'BAJFINANCE.NSE':'BAJFINANCE.NS',
  'KOTAKBANK.NSE': 'KOTAKBANK.NS',
  'LT.NSE':        'LT.NS',
  'WIPRO.NSE':     'WIPRO.NS',
  'MARUTI.NSE':    'MARUTI.NS',
}

const YF_INTERVAL = { '1m':'1m','5m':'5m','15m':'15m','1h':'60m','1D':'1d','1W':'1wk' }
const YF_RANGE    = { '1m':'1d','5m':'5d','15m':'1mo','1h':'3mo','1D':'1y','1W':'5y'  }

// ── Cache ──────────────────────────────────────────────────────────────────
const cache = {}
const cached = (key, ttlMs, fn) => {
  const now = Date.now()
  const hit = cache[key]
  if (hit && now - hit.ts < ttlMs) return Promise.resolve(hit.data)
  return fn()
    .then(data => { cache[key] = { data, ts: now }; return data })
    .catch(err => {
      if (hit) {
        console.warn(`[apiService] Using stale cache for ${key}:`, err.message)
        // Flag it so consumers can tell a stale price from a live one and avoid
        // acting on it as if it were current.
        return (hit.data && typeof hit.data === 'object')
          ? { ...hit.data, _stale: true, _staleAgeMs: now - hit.ts }
          : hit.data
      }
      throw err
    })
}

// ── NSE India — live quotes via Vite middleware ───────────────────────────
let nseSnapshot = null   // { NIFTY: {...}, BANKNIFTY: {...}, VIX: {...}, ts }

const refreshNSESnapshot = async () => {
  const { data } = await axios.get('/api/nse-data', { timeout: 8000 })
  if (data.error) throw new Error(data.error)
  nseSnapshot = data
  return data
}

const getNSEQuote = async (symbol) => {
  if (!NSE_INDEX_NAMES[symbol]) return null  // not an NSE index

  const snap = nseSnapshot || await refreshNSESnapshot()
  const row  = snap[symbol]
  if (!row) throw new Error(`${symbol} not in NSE data`)

  return {
    symbol,
    price:         parseFloat((row.price    || 0).toFixed(2)),
    change:        parseFloat((row.change   || 0).toFixed(2)),
    changePercent: parseFloat((row.changePercent || 0).toFixed(2)),
    open:          parseFloat((row.open     || row.price).toFixed(2)),
    high:          parseFloat((row.high     || row.price).toFixed(2)),
    low:           parseFloat((row.low      || row.price).toFixed(2)),
    prevClose:     parseFloat((row.prevClose|| row.price).toFixed(2)),
    volume:        0,
    dayHigh52W:    parseFloat((row.yearHigh || row.price * 1.2).toFixed(2)),
    dayLow52W:     parseFloat((row.yearLow  || row.price * 0.8).toFixed(2)),
    timestamp:     Date.now(),
    source:        'NSE',
  }
}

// ── Groww — historical candles (primary, reliable for indices) ─────────────
const GROWW_SYMBOLS = { NIFTY: true, BANKNIFTY: true }

const fetchGrowwCandles = async (symbol, timeframe, outputSize) => {
  const { data } = await axios.get('/api/groww/candles', {
    params: { symbol, tf: timeframe }, timeout: 15000,
  })
  if (data.error) throw new Error(data.error)
  const candles = (data.candles || []).filter(c => c.close > 0).slice(-outputSize)
  if (candles.length < 5) throw new Error('Not enough Groww candles')
  return candles
}

// ── Yahoo Finance — historical candles ─────────────────────────────────────
const fetchYFCandles = async (symbol, timeframe, outputSize) => {
  const yfSym = YF_SYMBOLS[symbol]
  if (!yfSym) throw new Error(`No Yahoo Finance symbol for ${symbol}`)

  const { data } = await axios.get(
    `/api/yahoo/v8/finance/chart/${encodeURIComponent(yfSym)}`,
    { params: { interval: YF_INTERVAL[timeframe] || '1d', range: YF_RANGE[timeframe] || '1y' }, timeout: 12000 }
  )

  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(data?.chart?.error?.description || 'No chart data')

  const timestamps = result.timestamp || []
  const q = result.indicators.quote[0]

  const candles = timestamps
    .map((t, i) => ({
      time:   t,
      open:   parseFloat((q.open[i]  ?? q.close[i] ?? 0).toFixed(2)),
      high:   parseFloat((q.high[i]  ?? q.close[i] ?? 0).toFixed(2)),
      low:    parseFloat((q.low[i]   ?? q.close[i] ?? 0).toFixed(2)),
      close:  parseFloat((q.close[i] ?? 0).toFixed(2)),
      volume: q.volume[i] ?? 0,
    }))
    .filter(c => c.close > 0)
    .slice(-outputSize)

  if (candles.length < 5) throw new Error('Not enough candles returned')
  return candles
}

// ── Public API ─────────────────────────────────────────────────────────────

export const fetchQuote = (symbol) =>
  cached(`quote:${symbol}`, 30_000, async () => {
    // Try NSE first (for indices), fallback attempted by caller
    const nseQ = await getNSEQuote(symbol).catch(() => null)
    if (nseQ) return nseQ

    // For individual stocks, try Yahoo Finance quote endpoint
    const yfSym = YF_SYMBOLS[symbol]
    if (!yfSym) throw new Error(`No data source for ${symbol}`)

    const { data } = await axios.get(
      `/api/yahoo/v8/finance/chart/${encodeURIComponent(yfSym)}`,
      { params: { interval: '1d', range: '5d' }, timeout: 10000 }
    )
    const meta     = data?.chart?.result?.[0]?.meta
    if (!meta) throw new Error('No quote data')
    const price    = meta.regularMarketPrice ?? 0
    const prevClose= meta.chartPreviousClose ?? meta.previousClose ?? price
    return {
      symbol,
      price:         parseFloat(price.toFixed(2)),
      change:        parseFloat((meta.regularMarketChange ?? price - prevClose).toFixed(2)),
      changePercent: parseFloat((meta.regularMarketChangePercent ?? 0).toFixed(2)),
      open:          parseFloat((meta.regularMarketOpen    ?? prevClose).toFixed(2)),
      high:          parseFloat((meta.regularMarketDayHigh ?? price).toFixed(2)),
      low:           parseFloat((meta.regularMarketDayLow  ?? price).toFixed(2)),
      prevClose:     parseFloat(prevClose.toFixed(2)),
      volume:        meta.regularMarketVolume ?? 0,
      dayHigh52W:    parseFloat((meta.fiftyTwoWeekHigh ?? price * 1.2).toFixed(2)),
      dayLow52W:     parseFloat((meta.fiftyTwoWeekLow  ?? price * 0.8).toFixed(2)),
      timestamp:     Date.now(),
      source:        'Yahoo',
    }
  })

export const fetchCandles = (symbol, timeframe = '1D', outputSize = 200) =>
  cached(`candles:${symbol}:${timeframe}`, 300_000, async () => {
    // Groww first for indices (reliable), Yahoo as fallback
    if (GROWW_SYMBOLS[symbol]) {
      try {
        return await fetchGrowwCandles(symbol, timeframe, outputSize)
      } catch (err) {
        console.warn(`[apiService] Groww candles failed for ${symbol}, falling back to Yahoo:`, err.message)
      }
    }
    return fetchYFCandles(symbol, timeframe, outputSize)
  })

// ── Groww — option chain (real per-strike premiums + IV) ───────────────────
// Groww's payload field names have varied across API versions, so we read
// defensively: try several known spellings and skip rows we can't parse.
const pickNum = (obj, ...keys) => {
  if (!obj) return null
  for (const k of keys) {
    const v = obj[k]
    if (v != null && !Number.isNaN(Number(v))) return Number(v)
  }
  return null
}

// Normalize a raw Groww option-chain payload into:
//   { strikes: Map<strike, {callLtp, callIV, callDelta, putLtp, putIV, putDelta}>, atmIV, count }
//
// Groww's live format (verified against the real API):
//   { underlying_ltp, strikes: { "23950": { CE: { ltp, greeks: {delta, iv} }, PE: {...} } } }
// `ltp` is the live market premium; IV and delta live inside each leg's `greeks`.
const normalizeOptionChain = (raw, spot) => {
  const strikes = new Map()
  // greeks-aware getters
  const legLtp   = (leg) => pickNum(leg, 'ltp', 'last_price', 'lastPrice', 'close_price', 'close')
  const legIV    = (leg) => pickNum(leg?.greeks, 'iv', 'implied_volatility') ?? pickNum(leg, 'iv', 'implied_volatility', 'impliedVolatility')
  const legDelta = (leg) => pickNum(leg?.greeks, 'delta') ?? pickNum(leg, 'delta')
  const setLeg   = (strike, call, put) => strikes.set(strike, {
    callLtp: legLtp(call), callIV: legIV(call), callDelta: legDelta(call),
    putLtp:  legLtp(put),  putIV:  legIV(put),  putDelta:  legDelta(put),
  })

  if (raw?.strikes && typeof raw.strikes === 'object' && !Array.isArray(raw.strikes)) {
    // Real Groww shape — object keyed by strike
    for (const [k, legs] of Object.entries(raw.strikes)) {
      const strike = Number(k)
      if (!Number.isFinite(strike) || !legs) continue
      setLeg(strike, legs.CE || legs.ce, legs.PE || legs.pe)
    }
  } else {
    // Fallback — array-of-rows shape (older/other API versions)
    const rows = raw?.option_chains || raw?.option_chain || raw?.chains || raw?.data || (Array.isArray(raw) ? raw : [])
    for (const row of rows) {
      const strike = pickNum(row, 'strike_price', 'strikePrice', 'strike')
      if (strike == null) continue
      setLeg(strike, row.call_option || row.call_options || row.callOption || row.ce || row.CE,
                     row.put_option  || row.put_options  || row.putOption  || row.pe || row.PE)
    }
  }

  // Use the passed spot, else the chain's own underlying LTP
  const useSpot = (Number.isFinite(spot) && spot > 0)
    ? spot
    : pickNum(raw, 'underlying_ltp', 'underlyingLtp', 'spot', 'spot_price')

  // ATM IV = IV of the strike nearest spot (average of call/put legs)
  let atmIV = null
  if (useSpot && strikes.size) {
    let best = null, bestDist = Infinity
    for (const [strike, leg] of strikes) {
      const d = Math.abs(strike - useSpot)
      if (d < bestDist) { bestDist = d; best = leg }
    }
    if (best) {
      const ivs = [best.callIV, best.putIV].filter(v => v != null)
      atmIV = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null
    }
  }

  return { strikes, atmIV, count: strikes.size }
}

export const fetchOptionChain = (symbol, spot, expiryISO = getNextExpiryISO()) =>
  cached(`chain:${symbol}:${expiryISO}`, 30_000, async () => {
    const { data } = await axios.get('/api/groww/option-chain', {
      params: { symbol, expiry: expiryISO }, timeout: 12000,
    })
    if (data.error) throw new Error(data.error)
    const chain = normalizeOptionChain(data, spot)
    if (!chain.count) throw new Error('Option chain returned no parseable strikes')
    return { ...chain, expiry: expiryISO }
  })

export const fetchMultipleQuotes = (symbols) =>
  Promise.allSettled(symbols.map(s => fetchQuote(s))).then(results =>
    results.reduce((acc, r) => {
      if (r.status === 'fulfilled') acc[r.value.symbol] = r.value
      return acc
    }, {})
  )

// Refresh NSE snapshot in background every 30 seconds
setInterval(() => {
  refreshNSESnapshot().catch(() => {})
}, 30_000)

export const fetchTopMovers = async () => ({ gainers: [], losers: [], unavailable: true })
export const isUsingMockData = () => false
