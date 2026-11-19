// AI track record: every AI call is saved with the trade levels shown at the time,
// then scored against the candles that came after it. The score is the AI's real
// accuracy, shown instead of the confidence number the model makes up.
//
// Stored in this browser's localStorage (per device). Each call is scored on the
// same index target/stop the card showed, for both the AI's side and the engine's.

const KEY = 'aiCallLog.v1'
const MAX_CALLS = 1000

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
const save = (list) => {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_CALLS))) } catch { /* storage blocked */ }
}

// One call per symbol/timeframe/candle/side — re-running on the same candle doesn't
// count twice.
export const logAICall = ({ symbol, timeframe, aiSide, engineSide, entry, targetPts, stopPts, holdBars, candleTime }) => {
  if (!symbol || !aiSide || !(entry > 0) || !(targetPts > 0) || !(stopPts > 0) || candleTime == null) return
  const list = load()
  if (list.some(e => e.symbol === symbol && e.timeframe === timeframe && e.candleTime === candleTime && e.aiSide === aiSide)) return
  list.push({
    id: Date.now(), at: new Date().toISOString(), symbol, timeframe, aiSide, engineSide,
    entry, targetPts, stopPts, holdBars: Math.max(1, holdBars || 10), candleTime,
    ai: null, engine: null,   // 'target' | 'stop' | 'timeout' once scored
  })
  save(list)
}

// Which level a side hit first over the bars after the call; null = not finished yet
const outcomeFor = (side, e, bars, complete) => {
  const target = side === 'CALL' ? e.entry + e.targetPts : e.entry - e.targetPts
  const stop   = side === 'CALL' ? e.entry - e.stopPts   : e.entry + e.stopPts
  for (const c of bars) {
    const hitT = side === 'CALL' ? c.high >= target : c.low <= target
    const hitS = side === 'CALL' ? c.low <= stop    : c.high >= stop
    if (hitS) return 'stop'          // a bar touching both counts as a loss
    if (hitT) return 'target'
  }
  return complete ? 'timeout' : null
}

// Score unfinished calls for this symbol/timeframe from the latest candles
export const scoreAICalls = (symbol, timeframe, candles) => {
  if (!candles?.length) return
  const list = load()
  let changed = false
  for (const e of list) {
    if (e.ai || e.symbol !== symbol || e.timeframe !== timeframe) continue
    const start = candles.findIndex(c => c.time > e.candleTime)
    if (start < 0) continue
    // The newest candle may still be forming; only count it once a later one exists
    const bars = candles.slice(start, Math.min(start + e.holdBars, candles.length - 1))
    const complete = bars.length >= e.holdBars
    const ai = outcomeFor(e.aiSide, e, bars, complete)
    if (!ai) continue
    e.ai = ai
    e.engine = e.engineSide ? outcomeFor(e.engineSide, e, bars, true) : null
    changed = true
  }
  if (changed) save(list)
}

// Hit rate over scored calls: right = target first, wrong = stop first or no target in time
export const getAIRecord = (symbol) => {
  const list = load().filter(e => !symbol || e.symbol === symbol)
  const scored = list.filter(e => e.ai)
  const aiRight = scored.filter(e => e.ai === 'target').length
  const withEngine = scored.filter(e => e.engine)
  const engineRight = withEngine.filter(e => e.engine === 'target').length
  return {
    calls: list.length,
    scored: scored.length,
    pending: list.length - scored.length,
    aiRight,
    aiRate: scored.length ? Math.round((aiRight / scored.length) * 100) : null,
    engineRight,
    engineRate: withEngine.length ? Math.round((engineRight / withEngine.length) * 100) : null,
  }
}
