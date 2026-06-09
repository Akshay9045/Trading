import axios from 'axios'

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
        return hit.data
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
