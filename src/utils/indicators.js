// Technical Indicators Calculator

export const calculateSMA = (data, period) => {
  const result = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue }
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    result.push(sum / period)
  }
  return result
}

export const calculateEMA = (data, period) => {
  const k = 2 / (period + 1)
  const result = []
  let ema = null
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue }
    if (ema === null) {
      ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
    } else {
      ema = data[i] * k + ema * (1 - k)
    }
    result.push(parseFloat(ema.toFixed(2)))
  }
  return result
}

export const calculateRSI = (closes, period = 14) => {
  const result = Array(closes.length).fill(null)
  if (closes.length < period + 1) return result

  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  result[period] = parseFloat((100 - 100 / (1 + rs)).toFixed(2))

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss
    result[i] = parseFloat((100 - 100 / (1 + rs2)).toFixed(2))
  }
  return result
}

export const calculateMACD = (closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  const ema12 = calculateEMA(closes, fastPeriod)
  const ema26 = calculateEMA(closes, slowPeriod)

  const macdLine = closes.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null
      ? parseFloat((ema12[i] - ema26[i]).toFixed(2))
      : null
  )

  const macdValues = macdLine.filter(v => v !== null)
  const macdEMA = calculateEMA(macdValues, signalPeriod)

  const signalLine = Array(macdLine.length).fill(null)
  let signalIdx = 0
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      if (signalIdx < macdEMA.length && macdEMA[signalIdx] !== null) {
        signalLine[i] = macdEMA[signalIdx]
      }
      signalIdx++
    }
  }

  const histogram = macdLine.map((m, i) =>
    m !== null && signalLine[i] !== null
      ? parseFloat((m - signalLine[i]).toFixed(2))
      : null
  )

  return { macd: macdLine, signal: signalLine, histogram }
}

export const calculateBollingerBands = (closes, period = 20, stdMultiplier = 2) => {
  const sma = calculateSMA(closes, period)
  const upper = [], lower = [], middle = []

  for (let i = 0; i < closes.length; i++) {
    if (sma[i] === null) { upper.push(null); lower.push(null); middle.push(null); continue }
    const slice = closes.slice(i - period + 1, i + 1)
    const mean = sma[i]
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period
    const std = Math.sqrt(variance)
    upper.push(parseFloat((mean + stdMultiplier * std).toFixed(2)))
    lower.push(parseFloat((mean - stdMultiplier * std).toFixed(2)))
    middle.push(parseFloat(mean.toFixed(2)))
  }
  return { upper, lower, middle }
}

export const calculateVWAP = (candles) => {
  let cumVolume = 0, cumTPV = 0
  return candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3
    cumTPV += tp * c.volume
    cumVolume += c.volume
    return cumVolume === 0 ? null : parseFloat((cumTPV / cumVolume).toFixed(2))
  })
}

export const calculateATR = (candles, period = 14) => {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low
    const prevClose = candles[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose))
  })
  return calculateSMA(tr, period)
}

// ADX (Average Directional Index) — measures TREND STRENGTH (not direction).
// >25 = strong trend (signals more reliable); <20 = ranging/choppy (signals unreliable).
// Returns array aligned to candles: { adx, plusDI, minusDI }
export const calculateADX = (candles, period = 14) => {
  const len = candles.length
  const out = Array(len).fill(null).map(() => ({ adx: null, plusDI: null, minusDI: null }))
  if (len < period * 2) return out

  const tr = Array(len).fill(0)
  const plusDM = Array(len).fill(0)
  const minusDM = Array(len).fill(0)

  for (let i = 1; i < len; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close
    const ph = candles[i - 1].high, pl = candles[i - 1].low
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    const up = h - ph, down = pl - l
    plusDM[i]  = (up > down && up > 0) ? up : 0
    minusDM[i] = (down > up && down > 0) ? down : 0
  }

  // Wilder's smoothing
  let smTR = 0, smPlus = 0, smMinus = 0
  for (let i = 1; i <= period; i++) { smTR += tr[i]; smPlus += plusDM[i]; smMinus += minusDM[i] }

  const dx = Array(len).fill(null)
  for (let i = period + 1; i < len; i++) {
    smTR    = smTR    - smTR / period    + tr[i]
    smPlus  = smPlus  - smPlus / period  + plusDM[i]
    smMinus = smMinus - smMinus / period + minusDM[i]
    const plusDI  = smTR === 0 ? 0 : 100 * smPlus / smTR
    const minusDI = smTR === 0 ? 0 : 100 * smMinus / smTR
    out[i].plusDI = parseFloat(plusDI.toFixed(2))
    out[i].minusDI = parseFloat(minusDI.toFixed(2))
    const denom = plusDI + minusDI
    dx[i] = denom === 0 ? 0 : 100 * Math.abs(plusDI - minusDI) / denom
  }

  // ADX = Wilder-smoothed average of DX
  const firstDX = period * 2
  if (firstDX < len) {
    let adx = 0, count = 0
    for (let i = period + 1; i <= firstDX; i++) { if (dx[i] != null) { adx += dx[i]; count++ } }
    adx = count ? adx / count : 0
    out[firstDX].adx = parseFloat(adx.toFixed(2))
    for (let i = firstDX + 1; i < len; i++) {
      adx = (adx * (period - 1) + dx[i]) / period
      out[i].adx = parseFloat(adx.toFixed(2))
    }
  }
  return out
}

export const calculateStochRSI = (closes, rsiPeriod = 14, stochPeriod = 14) => {
  const rsi = calculateRSI(closes, rsiPeriod)
  const result = Array(closes.length).fill(null)
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    const slice = rsi.slice(i - stochPeriod + 1, i + 1).filter(v => v !== null)
    if (slice.length < stochPeriod) continue
    const minRSI = Math.min(...slice)
    const maxRSI = Math.max(...slice)
    result[i] = maxRSI === minRSI ? 50 : parseFloat(((rsi[i] - minRSI) / (maxRSI - minRSI) * 100).toFixed(2))
  }
  return result
}

// Resample candles to a higher timeframe by grouping every `factor` bars into one.
// e.g. 15m candles with factor 4 ≈ 1h candles.
// IMPORTANT: groups are anchored to the RIGHT edge (most recent bar always closes
// a group). Anchoring to index 0 would re-bucket every bar as the array grows by
// one each backtest step, making the HTF trend "repaint" and become non-causal.
// The leftmost partial group is dropped so every HTF candle has `factor` real bars.
export const resampleCandles = (candles, factor) => {
  if (factor <= 1) return candles
  const out = []
  for (let end = candles.length; end - factor >= 0; end -= factor) {
    const group = candles.slice(end - factor, end)
    out.unshift({
      time:   group[0].time,
      open:   group[0].open,
      high:   Math.max(...group.map(c => c.high)),
      low:    Math.min(...group.map(c => c.low)),
      close:  group[group.length - 1].close,
      volume: group.reduce((s, c) => s + (c.volume || 0), 0),
    })
  }
  return out
}

export const getIndicatorSummary = (closes, candles) => {
  const len = closes.length
  if (len < 30) return null

  const rsi = calculateRSI(closes)
  const { macd, signal, histogram } = calculateMACD(closes)
  const ema9 = calculateEMA(closes, 9)
  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)
  const { upper, lower, middle } = calculateBollingerBands(closes)
  const atr = calculateATR(candles)
  const adxArr = calculateADX(candles)

  const last = len - 1
  const price = closes[last]

  return {
    adx: adxArr[last]?.adx ?? null,
    plusDI: adxArr[last]?.plusDI ?? null,
    minusDI: adxArr[last]?.minusDI ?? null,
    rsi: rsi[last],
    macd: macd[last],
    macdSignal: signal[last],
    macdHistogram: histogram[last],
    ema9: ema9[last],
    ema20: ema20[last],
    ema50: ema50[last],
    bbUpper: upper[last],
    bbLower: lower[last],
    bbMiddle: middle[last],
    atr: atr[last],
    price,
    prevRSI: rsi[last - 1],
    prevMACD: macd[last - 1],
    prevSignal: signal[last - 1],
    prevHistogram: histogram[last - 1],
    prevEma9: ema9[last - 1],
    prevEma20: ema20[last - 1],
  }
}
