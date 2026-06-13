import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchCandles, fetchQuote, fetchOptionChain } from '../services/apiService'
import { generateSignal } from '../services/signalEngine'
import { runBacktest } from '../services/backtestEngine'

// Calibration: replace the engine's arbitrary "confidence" with the REAL win rate
// measured by backtesting this same signal logic over the loaded candles. We attach
// both the per-direction win rate/expectancy and the win rate for this signal's
// confidence bucket. `calibrated` is true only when we have enough samples to trust.
const MIN_BUCKET_SAMPLES = 8

const calibrateSignal = (signal, candles) => {
  if (!signal || signal.type === 'HOLD' || !candles || candles.length < 90) return signal
  let bt
  try { bt = runBacktest(candles) } catch { return signal }
  if (!bt) return signal

  const dir       = signal.type === 'BUY' ? bt.byDirection.CALL : bt.byDirection.PUT
  const bucketKey = Math.floor(signal.confidence / 10) * 10
  const bucket    = bt.buckets[bucketKey]
  const bSamples  = bucket ? bucket.total : 0
  const bWinRate  = bSamples >= MIN_BUCKET_SAMPLES ? Math.round((bucket.wins / bucket.total) * 100) : null

  return {
    ...signal,
    signalStrength:  signal.confidence,                                       // keep the raw formula score
    backtestWinRate: dir.decided ? Math.round(dir.winRate * 100) : null,      // real win rate, this direction
    backtestSamples: dir.decided || 0,
    bucketWinRate:   bWinRate,                                                // win rate for this confidence band
    bucketSamples:   bSamples,
    expectancy:      dir.decided ? parseFloat(dir.expectancy.toFixed(2)) : null, // avg R per trade, after costs
    calibrated:      bWinRate != null,
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
