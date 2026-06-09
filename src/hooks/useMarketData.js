import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchCandles, fetchQuote } from '../services/apiService'
import { generateSignal } from '../services/signalEngine'

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
      setSignal(generateSignal(candleResult.value))
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

  useEffect(() => {
    abortRef.current = false
    load()
    const interval = setInterval(load, 60000)
    return () => {
      abortRef.current = true
      clearInterval(interval)
    }
  }, [load])

  return { candles, quote, signal, loading, error, refresh: load }
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
