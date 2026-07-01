import { getIndicatorSummary, calculateATR, calculateEMA, resampleCandles } from '../utils/indicators'

// Higher-timeframe trend: resample to a bigger timeframe and read its EMA20-vs-EMA50 slope.
// Returns 'up', 'down', or 'flat'. Used to confirm lower-timeframe signals.
const higherTimeframeTrend = (candles, factor) => {
  const htf = resampleCandles(candles, factor)
  if (htf.length < 50) return 'flat'
  const closes = htf.map(c => c.close)
  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)
  const last = closes.length - 1
  const c = closes[last], e20 = ema20[last], e50 = ema50[last]
  if (e20 == null || e50 == null) return 'flat'
  if (c > e50 && e20 > e50) return 'up'
  if (c < e50 && e20 < e50) return 'down'
  return 'flat'
}

const SIGNAL_WEIGHTS = {
  rsi: 0.20,
  macd: 0.25,
  ema: 0.20,
  bollinger: 0.15,
  momentum: 0.20,
}

export const generateSignal = (candles, opts = {}) => {
  // targetATR/stopATR = ATR multiples for target & stop; trendFilter = only trade with the EMA trend.
  // adxMin = skip trades when ADX (trend strength) is below this (0 = off). Defaults are backtest-validated.
  const { targetATR = 1, stopATR = 1, trendFilter = true, adxMin = 22, htfFactor = 0, alwaysSignal = false } = opts
  if (!candles || candles.length < 50) return null

  const closes = candles.map(c => c.close)
  const indicators = getIndicatorSummary(closes, candles)
  if (!indicators) return null

  const { rsi, macd, macdSignal, macdHistogram, prevHistogram, ema9, ema20, ema50,
    bbUpper, bbLower, bbMiddle, price, atr, prevEma9, prevEma20, adx } = indicators

  let bullScore = 0, bearScore = 0
  const reasons = []

  // RSI Analysis
  if (rsi !== null) {
    if (rsi < 30) { bullScore += SIGNAL_WEIGHTS.rsi; reasons.push({ text: `RSI oversold (${rsi.toFixed(1)})`, side: 'bull' }) }
    else if (rsi < 45) { bullScore += SIGNAL_WEIGHTS.rsi * 0.5; reasons.push({ text: `RSI neutral-bullish (${rsi.toFixed(1)})`, side: 'bull' }) }
    else if (rsi > 70) { bearScore += SIGNAL_WEIGHTS.rsi; reasons.push({ text: `RSI overbought (${rsi.toFixed(1)})`, side: 'bear' }) }
    else if (rsi > 55) { bearScore += SIGNAL_WEIGHTS.rsi * 0.5; reasons.push({ text: `RSI neutral-bearish (${rsi.toFixed(1)})`, side: 'bear' }) }
    else { reasons.push({ text: `RSI neutral (${rsi.toFixed(1)})`, side: 'neutral' }) }
  }

  // MACD Analysis
  if (macd !== null && macdSignal !== null) {
    const crossedUp = prevHistogram !== null && prevHistogram < 0 && macdHistogram > 0
    const crossedDown = prevHistogram !== null && prevHistogram > 0 && macdHistogram < 0

    if (crossedUp) { bullScore += SIGNAL_WEIGHTS.macd; reasons.push({ text: 'MACD Bullish Crossover', side: 'bull' }) }
    else if (macd > macdSignal && macdHistogram > 0) { bullScore += SIGNAL_WEIGHTS.macd * 0.6; reasons.push({ text: 'MACD above Signal line', side: 'bull' }) }
    else if (crossedDown) { bearScore += SIGNAL_WEIGHTS.macd; reasons.push({ text: 'MACD Bearish Crossover', side: 'bear' }) }
    else if (macd < macdSignal && macdHistogram < 0) { bearScore += SIGNAL_WEIGHTS.macd * 0.6; reasons.push({ text: 'MACD below Signal line', side: 'bear' }) }
  }

  // EMA Analysis
  if (ema9 !== null && ema20 !== null && ema50 !== null) {
    const emaCrossUp = prevEma9 < prevEma20 && ema9 > ema20
    const emaCrossDown = prevEma9 > prevEma20 && ema9 < ema20

    if (emaCrossUp) { bullScore += SIGNAL_WEIGHTS.ema; reasons.push({ text: 'EMA9 crossed above EMA20', side: 'bull' }) }
    else if (price > ema9 && ema9 > ema20 && ema20 > ema50) { bullScore += SIGNAL_WEIGHTS.ema * 0.8; reasons.push({ text: 'Bullish EMA alignment', side: 'bull' }) }
    else if (emaCrossDown) { bearScore += SIGNAL_WEIGHTS.ema; reasons.push({ text: 'EMA9 crossed below EMA20', side: 'bear' }) }
    else if (price < ema9 && ema9 < ema20 && ema20 < ema50) { bearScore += SIGNAL_WEIGHTS.ema * 0.8; reasons.push({ text: 'Bearish EMA alignment', side: 'bear' }) }
  }

  // Bollinger Bands
  if (bbUpper !== null && bbLower !== null) {
    const bandWidth = bbUpper - bbLower
    const positionPct = (price - bbLower) / bandWidth

    if (price <= bbLower) { bullScore += SIGNAL_WEIGHTS.bollinger; reasons.push({ text: 'Price at Lower BB (oversold)', side: 'bull' }) }
    else if (positionPct < 0.25) { bullScore += SIGNAL_WEIGHTS.bollinger * 0.5; reasons.push({ text: 'Price near Lower BB', side: 'bull' }) }
    else if (price >= bbUpper) { bearScore += SIGNAL_WEIGHTS.bollinger; reasons.push({ text: 'Price at Upper BB (overbought)', side: 'bear' }) }
    else if (positionPct > 0.75) { bearScore += SIGNAL_WEIGHTS.bollinger * 0.5; reasons.push({ text: 'Price near Upper BB', side: 'bear' }) }
  }

  // Momentum (recent price action)
  const recentCloses = closes.slice(-10)
  const momentum = (recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses[0] * 100
  if (momentum > 0.5) { bullScore += SIGNAL_WEIGHTS.momentum * Math.min(1, momentum / 2); reasons.push({ text: `Positive momentum +${momentum.toFixed(2)}%`, side: 'bull' }) }
  else if (momentum < -0.5) { bearScore += SIGNAL_WEIGHTS.momentum * Math.min(1, Math.abs(momentum) / 2); reasons.push({ text: `Negative momentum ${momentum.toFixed(2)}%`, side: 'bear' }) }

  // Determine signal
  const totalBull = bullScore
  const totalBear = bearScore
  const diff = totalBull - totalBear
  // Scale confidence: 0.1 diff → ~52%, 0.3 diff → ~65%, 0.6 diff → ~82%
  const confidence = Math.min(95, Math.floor(40 + Math.abs(diff) * 100))

  let signalType = 'HOLD'
  if (diff > 0.1) signalType = 'BUY'
  else if (diff < -0.1) signalType = 'SELL'

  const uptrend   = price > ema50 && ema20 > ema50
  const downtrend = price < ema50 && ema20 < ema50

  if (alwaysSignal) {
    // Never sit out: always take the directional lean, even when weak or counter-trend.
    // Quality is communicated via `trendAligned` + confidence/backtest grading, not by hiding it.
    if (signalType === 'HOLD') signalType = diff >= 0 ? 'BUY' : 'SELL'
  } else {
    // Trend filter — only take CALLs in an uptrend and PUTs in a downtrend
    if (trendFilter && signalType !== 'HOLD') {
      if (signalType === 'BUY'  && !uptrend)   signalType = 'HOLD'
      if (signalType === 'SELL' && !downtrend) signalType = 'HOLD'
    }
    // ADX filter — skip choppy/ranging markets where breakouts fail
    if (adxMin > 0 && signalType !== 'HOLD' && (adx == null || adx < adxMin)) {
      signalType = 'HOLD'
    }
    // Higher-timeframe confirmation — only trade if the bigger timeframe agrees
    if (htfFactor > 1 && signalType !== 'HOLD') {
      const htf = higherTimeframeTrend(candles, htfFactor)
      if (signalType === 'BUY'  && htf !== 'up')   signalType = 'HOLD'
      if (signalType === 'SELL' && htf !== 'down') signalType = 'HOLD'
    }
  }

  // Is the chosen direction with the prevailing EMA trend? (used for quality grading)
  const trendAligned = (signalType === 'BUY' && uptrend) || (signalType === 'SELL' && downtrend)

  // Calculate entry, target, stop loss using ATR
  const atrValue = atr || price * 0.005
  const riskMultiplier = stopATR
  const rewardMultiplier = targetATR

  const entry = price
  let target, stopLoss

  if (signalType === 'BUY') {
    stopLoss = parseFloat((entry - atrValue * riskMultiplier).toFixed(2))
    target = parseFloat((entry + atrValue * rewardMultiplier).toFixed(2))
  } else if (signalType === 'SELL') {
    stopLoss = parseFloat((entry + atrValue * riskMultiplier).toFixed(2))
    target = parseFloat((entry - atrValue * rewardMultiplier).toFixed(2))
  } else {
    stopLoss = parseFloat((entry - atrValue).toFixed(2))
    target = parseFloat((entry + atrValue).toFixed(2))
  }

  const rrRatio = parseFloat((Math.abs(target - entry) / Math.abs(entry - stopLoss)).toFixed(2))

  return {
    type: signalType,
    entry: parseFloat(entry.toFixed(2)),
    target,
    stopLoss,
    confidence,
    rrRatio,
    trendAligned,
    bullScore: parseFloat((totalBull * 100).toFixed(1)),
    bearScore: parseFloat((totalBear * 100).toFixed(1)),
    neutralScore: parseFloat(((1 - totalBull - totalBear) * 100).toFixed(1)),
    reasons,
    indicators: {
      adx: adx != null ? parseFloat(adx.toFixed(1)) : null,
      rsi: rsi ? parseFloat(rsi.toFixed(2)) : null,
      macd: macd ? parseFloat(macd.toFixed(2)) : null,
      macdSignal: macdSignal ? parseFloat(macdSignal.toFixed(2)) : null,
      ema9: ema9 ? parseFloat(ema9.toFixed(2)) : null,
      ema20: ema20 ? parseFloat(ema20.toFixed(2)) : null,
      ema50: ema50 ? parseFloat(ema50.toFixed(2)) : null,
      bbUpper: bbUpper ? parseFloat(bbUpper.toFixed(2)) : null,
      bbLower: bbLower ? parseFloat(bbLower.toFixed(2)) : null,
    },
    timestamp: new Date().toISOString(),
  }
}

export const getAIPrediction = (signal, quote) => {
  if (!signal || !quote) return null

  const bullishPct = Math.min(90, Math.max(10, signal.bullScore))
  const bearishPct = Math.min(90, Math.max(10, signal.bearScore))
  const total = bullishPct + bearishPct
  const normalizedBull = Math.floor((bullishPct / total) * 100)
  const normalizedBear = 100 - normalizedBull

  // Fear & Greed — a HEURISTIC proxy derived from RSI (a real momentum oscillator):
  // low RSI = fear, high RSI = greed, which lines up with the labels below. Nudged
  // slightly by the net directional bias. This is NOT a real market-wide F&G index.
  // (The old formula multiplied a 0–100 score by 30, which pinned the value to 100.)
  const rsi = signal.indicators.rsi ?? 50
  const bias = (signal.bullScore - signal.bearScore) / 10   // bull/bearScore are 0–100 → small tilt
  const fgValue = Math.min(100, Math.max(0, Math.round(rsi + bias)))

  return {
    bullishProbability: normalizedBull,
    bearishProbability: normalizedBear,
    fearGreedIndex: fgValue,
    fearGreedLabel: fgValue < 25 ? 'Extreme Fear' : fgValue < 45 ? 'Fear' : fgValue < 55 ? 'Neutral' : fgValue < 75 ? 'Greed' : 'Extreme Greed',
    marketSentiment: signal.type === 'BUY' ? 'Bullish' : signal.type === 'SELL' ? 'Bearish' : 'Neutral',
    trendStrength: signal.confidence > 75 ? 'Strong' : signal.confidence > 55 ? 'Moderate' : 'Weak',
    shortTermOutlook: normalizedBull > 60 ? 'Positive' : normalizedBear > 60 ? 'Negative' : 'Sideways',
    volumeAnalysis: 'Unavailable',   // indices report no per-candle volume — don't fabricate it with Math.random()
  }
}
