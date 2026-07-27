import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchCandles, fetchQuote, fetchOptionChain } from '../services/apiService'
import { generateSignal } from '../services/signalEngine'
import { runBacktest } from '../services/backtestEngine'
import { calculateEMA } from '../utils/indicators'

// Calibration: replace the engine's arbitrary "confidence" with the REAL win rate
// measured by backtesting this same signal logic over the loaded candles. We attach
// both the per-direction win rate/expectancy and the win rate for this signal's
// confidence bucket. `calibrated` is true only when we have enough samples to trust.
const MIN_BUCKET_SAMPLES = 8

// `signalOpts` MUST match the options used to generate `signal`, so the backtest
// takes trades in the same way (e.g. always-trade / no trend filter). Otherwise the
// live signal's direction may have zero backtested trades → a blank "n=0" display.
export const calibrateSignal = (signal, candles, signalOpts = {}) => {
  if (!signal || signal.type === 'HOLD' || !candles || candles.length < 90) return signal
  let bt
  try { bt = runBacktest(candles, { signalOpts }) } catch { return signal }
  if (!bt) return signal

  // Use THIS direction's own backtested trades — consistent numbers, no all-directions
  // bucket mismatch. `calibrated` is true only when this direction has enough samples.
  const dir      = signal.type === 'BUY' ? bt.byDirection.CALL : bt.byDirection.PUT
  const decided  = dir.decided || 0
  const enough   = decided >= MIN_BUCKET_SAMPLES

  return {
    ...signal,
    signalStrength:  signal.confidence,                                        // keep the raw formula score
    backtestWinRate: enough ? Math.round(dir.winRate * 100) : null,            // real win rate, this direction
    backtestSamples: decided,
    bucketWinRate:   enough ? Math.round(dir.winRate * 100) : null,            // (kept for callers) same source now
    bucketSamples:   decided,
    expectancy:      enough ? parseFloat(dir.expectancy.toFixed(2)) : null,    // avg R per trade, after costs
    calibrated:      enough,
  }
}

export const useMarketData = (symbol, timeframe = '1D') => {
  const [candles, setCandles] = useState([])
  const [quote, setQuote] = useState(null)
  const [signal, setSignal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current = false
    setLoading(true)
    setError(null)

    // Fetch candles and quote independently so one failure doesn't block both
    const [candleResult, quoteResult] = await Promise.allSettled([
      fetchCandles(symbol, timeframe, 200),
      fetchQuote(symbol),
    ])

    if (abortRef.current) return

    if (quoteResult.status === 'fulfilled') {
      setQuote(quoteResult.value)
    }

    if (candleResult.status === 'fulfilled') {
      setCandles(candleResult.value)
      setSignal(calibrateSignal(generateSignal(candleResult.value), candleResult.value))
    } else {
      // Only show error if quote also failed — candle failure alone is non-fatal
      if (quoteResult.status === 'rejected') {
        setError(quoteResult.reason?.message || 'Failed to load market data')
      }
      // Candle-only failure: log quietly, signal stays null, quote still usable
      console.warn('[useMarketData] Candles unavailable:', candleResult.reason?.message)
    }

    setLoading(false)
  }, [symbol, timeframe])

  // Fetch on mount and whenever symbol/timeframe changes. NO auto-poll — candles
  // for 15m/daily timeframes don't change minute-to-minute, and constant polling
  // is what kept re-poking Groww's token endpoint during a rate-limit cooldown.
  // Use the returned `refresh` (the manual button) to pull fresh data on demand.
  useEffect(() => {
    abortRef.current = false
    load()
    return () => { abortRef.current = true }
  }, [load])

  return { candles, quote, signal, loading, error, refresh: load }
}

// Fetches the live option chain (real premiums + IV) for the next weekly expiry.
// `spot` is used to locate the ATM strike for IV; pass the live quote price.
// Returns null until loaded or if the chain is unavailable (engine then falls
// back to estimated premiums).
// `refreshKey` (optional) — pass a value that changes when the user clicks refresh
// to re-pull the chain on demand. No auto-poll: the chain is fetched on mount and
// on symbol/refreshKey change only, to avoid hammering Groww's token endpoint.
export const useOptionChain = (symbol, spot, refreshKey = 0) => {
  const [chain, setChain] = useState(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await fetchOptionChain(symbol, spot)
        if (active) setChain(data)
      } catch (err) {
        if (active) setChain(null)
        console.warn('[useOptionChain] unavailable, using estimated premiums:', err.message)
      }
    }
    load()
    return () => { active = false }
  }, [symbol, refreshKey])   // spot excluded — avoids refetch on every price tick

  return chain
}

// Daily-trend read for higher-timeframe alignment. Fetches 1D candles once and
// returns 'up' | 'down' | 'flat' from price vs EMA20/EMA50. Intraday signals pass
// this as `higherTrend` so 5m/15m follow the Daily instead of contradicting it.
export const useDailyTrend = (symbol) => {
  const [trend, setTrend] = useState(null)

  useEffect(() => {
    let active = true
    fetchCandles(symbol, '1D', 200)
      .then(candles => {
        if (!active) return
        const closes = candles.map(c => c.close)
        const e20 = calculateEMA(closes, 20)
        const e50 = calculateEMA(closes, 50)
        const i   = closes.length - 1
        const px = closes[i], a = e20[i], b = e50[i]
        if (a == null || b == null) { setTrend('flat'); return }
        setTrend(px > b && a > b ? 'up' : px < b && a < b ? 'down' : 'flat')
      })
      .catch(() => { if (active) setTrend(null) })
    return () => { active = false }
  }, [symbol])

  return trend
}

export const useRealtimeQuote = (symbol, intervalMs = 5000) => {
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const data = await fetchQuote(symbol)
        if (active) { setQuote(data); setLoading(false); setError(null) }
      } catch (err) {
        if (active) { setError(err.message); setLoading(false) }
      }
    }
    refresh()
    const interval = setInterval(refresh, intervalMs)
    return () => { active = false; clearInterval(interval) }
  }, [symbol, intervalMs])

  return { quote, loading, error }
}
