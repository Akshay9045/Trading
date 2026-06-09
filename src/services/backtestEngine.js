// Backtest engine — walks the signal engine bar-by-bar over historical candles
// and measures whether each signal's TARGET or STOP-LOSS was hit first.
// Purpose: tell the truth about how often the signals actually win, by confidence.

import { generateSignal } from './signalEngine'

// horizon   = how many future bars a trade is allowed to play out over
// minCandles= warm-up bars needed before the indicators are valid
// tieBreak  = when one bar touches BOTH target and stop, which wins:
//             'stop' (conservative/pessimistic) or 'target' (optimistic)
export const runBacktest = (candles, { horizon = 10, minCandles = 60, tieBreak = 'stop', signalOpts = {} } = {}) => {
  if (!candles || candles.length < minCandles + horizon + 1) return null

  const trades = []

  for (let i = minCandles; i < candles.length - 1; i++) {
    const sig = generateSignal(candles.slice(0, i + 1), signalOpts)
    if (!sig || sig.type === 'HOLD') continue

    const { type, entry, target, stopLoss, confidence, rrRatio } = sig
    let outcome = 'timeout'

    for (let j = i + 1; j <= i + horizon && j < candles.length; j++) {
      const c = candles[j]
      const hitTarget = type === 'BUY' ? c.high >= target  : c.low  <= target
      const hitStop   = type === 'BUY' ? c.low  <= stopLoss : c.high >= stopLoss
      if (hitTarget && hitStop) { outcome = tieBreak === 'target' ? 'target' : 'stop'; break }
      if (hitStop)              { outcome = 'stop';   break }
      if (hitTarget)            { outcome = 'target'; break }
    }

    trades.push({ index: i, type, confidence, entry, target, stopLoss, rr: rrRatio, outcome })
  }

  const summarize = (list) => {
    const decided = list.filter(t => t.outcome !== 'timeout')
    const wins    = decided.filter(t => t.outcome === 'target').length
    const R       = decided.reduce((s, t) => s + (t.outcome === 'target' ? t.rr : -1), 0)
    return {
      total:      list.length,
      decided:    decided.length,
      timeouts:   list.length - decided.length,
      wins,
      losses:     decided.length - wins,
      winRate:    decided.length ? wins / decided.length : 0,
      expectancy: decided.length ? R / decided.length : 0,
    }
  }

  // Calibration buckets (decided trades only)
  const buckets = {}
  for (const t of trades.filter(t => t.outcome !== 'timeout')) {
    const b = Math.floor(t.confidence / 10) * 10
    ;(buckets[b] ||= { total: 0, wins: 0 }).total++
    if (t.outcome === 'target') buckets[b].wins++
  }

  return {
    ...summarize(trades),
    byDirection: {
      CALL: summarize(trades.filter(t => t.type === 'BUY')),
      PUT:  summarize(trades.filter(t => t.type === 'SELL')),
    },
    buckets,
    trades,
  }
}
