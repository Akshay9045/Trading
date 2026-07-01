// Backtest engine — walks the signal engine bar-by-bar over historical candles
// and measures whether each signal's TARGET or STOP-LOSS was hit first.
// Purpose: tell the truth about how often the signals actually win, by confidence.

import { generateSignal } from './signalEngine'

// horizon   = how many future bars a trade is allowed to play out over
// minCandles= warm-up bars needed before the indicators are valid
// tieBreak  = when one bar touches BOTH target and stop, which wins:
//             'stop' (conservative/pessimistic) or 'target' (optimistic)
// costR     = round-trip cost (brokerage + STT + slippage + bid/ask spread)
//             expressed in units of risk (R). Deducted from EVERY trade. 0.10 means
//             each trade pays 10% of the amount it was risking. TUNE THIS to your
//             broker + the option's spread — for weekly options it can be 0.15–0.30.
export const runBacktest = (candles, { horizon = 10, minCandles = 60, tieBreak = 'stop', costR = 0.10, signalOpts = {} } = {}) => {
  if (!candles || candles.length < minCandles + horizon + 1) return null

  const trades = []

  // Decision is made at the CLOSE of bar i (that's the latest data we have).
  // We can only act on it from the NEXT bar — so we fill at candles[i+1].open,
  // not candles[i].close. Filling at the signal bar's close is lookahead and
  // inflates the win rate. The target/stop are the engine's ATR levels; we
  // recompute R:R from the actual fill so gap-ups/downs are accounted for.
  for (let i = minCandles; i < candles.length - 1; i++) {
    const sig = generateSignal(candles.slice(0, i + 1), signalOpts)
    if (!sig || sig.type === 'HOLD') continue

    const { type, target, stopLoss, confidence } = sig
    const fill   = candles[i + 1].open
    const reward = Math.abs(target - fill)
    const risk   = Math.abs(fill - stopLoss)
    const rr     = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0
    let outcome  = 'timeout'

    // Scan from the entry bar (i+1) onward — it can hit target/stop intrabar too.
    for (let j = i + 1; j <= i + horizon && j < candles.length; j++) {
      const c = candles[j]
      const hitTarget = type === 'BUY' ? c.high >= target  : c.low  <= target
      const hitStop   = type === 'BUY' ? c.low  <= stopLoss : c.high >= stopLoss
      if (hitTarget && hitStop) { outcome = tieBreak === 'target' ? 'target' : 'stop'; break }
      if (hitStop)              { outcome = 'stop';   break }
      if (hitTarget)            { outcome = 'target'; break }
    }

    trades.push({ index: i, type, confidence, entry: fill, target, stopLoss, rr, outcome })
  }

  const summarize = (list) => {
    const decided = list.filter(t => t.outcome !== 'timeout')
    const wins    = decided.filter(t => t.outcome === 'target').length
    // Cost is paid on every trade: a win nets (rr − costR), a loss nets (−1 − costR).
    const R       = decided.reduce((s, t) => s + (t.outcome === 'target' ? t.rr - costR : -1 - costR), 0)
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
