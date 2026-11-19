// Realistic option trade levels: target sized to what the index can usually move
// before expiry, stop and target set together, and time decay taken off the target.
//
// Why: a fixed 1 ATR target on the Daily view asked NIFTY for ~324 points with one
// day to expiry, while the 35% premium stop sat only ~70 points away. The stop was
// hit far more often than the target. Every level here is in index points first,
// then converted to the option's premium with its delta.

import { MAX_PREMIUM_STOP_PCT } from './optionsEngine'

export const SESSION_MIN = 375            // NSE cash session 09:15–15:30 IST
const OPEN_MIN  = 9 * 60 + 15
const CLOSE_MIN = 15 * 60 + 30
const YEAR_MIN  = SESSION_MIN * 252       // trading minutes in a year (for IV scaling)

// A move of this many sigmas is touched ~50% of the time within the window
export const REACH_SIGMA = 0.67

export const BAR_MIN = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1D': SESSION_MIN }

// IST calendar parts for a timestamp (independent of the machine's time zone)
const istParts = (ms) => {
  const d = new Date(ms + 330 * 60000)
  return { key: d.toISOString().slice(0, 10), dow: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

// Trading minutes from `now` until 15:30 IST on the expiry date. Weekends are skipped;
// exchange holidays are not known here, so this can overstate time by a day around one.
export const tradingMinutesUntil = (expiryISO, now = Date.now()) => {
  if (!expiryISO) return null
  const today = istParts(now)
  if (today.key > expiryISO) return 0
  const weekday = (dow) => dow !== 0 && dow !== 6
  const leftToday = weekday(today.dow) ? Math.max(0, Math.min(SESSION_MIN, CLOSE_MIN - Math.max(today.min, OPEN_MIN))) : 0
  if (today.key === expiryISO) return leftToday
  let mins = leftToday
  const day = new Date(`${today.key}T00:00:00Z`)
  for (let i = 0; i < 60; i++) {
    day.setUTCDate(day.getUTCDate() + 1)
    if (weekday(day.getUTCDay())) mins += SESSION_MIN
    if (day.toISOString().slice(0, 10) >= expiryISO) break
  }
  return mins
}

// Groww reports IV in percent (e.g. 12.4); accept a fraction too.
const toFraction = (iv) => (iv == null || !(iv > 0) ? null : iv > 2 ? iv / 100 : iv)

/**
 * planTrade — index and premium levels for buying one option.
 *
 * spot, atr        index price and ATR of the chosen timeframe
 * premium, delta   the option's live LTP and delta (delta ~0.5 if unknown)
 * strike, side     to split intrinsic from time value ('CALL' | 'PUT')
 * iv               implied volatility (chain ATM IV, else India VIX)
 * expiryISO        the option's expiry date (YYYY-MM-DD)
 * timeframe        '5m' | '15m' | '1D' — how long a trade is held (maxBars bars)
 */
export const planTrade = ({
  spot, atr, premium, delta, strike, side = 'CALL', iv, expiryISO, timeframe = '15m',
  now = Date.now(), targetATR = 1, stopATR = 1, maxBars = 10,
}) => {
  if (!(spot > 0) || !(atr > 0)) return null
  const reasons = []
  const barMin  = BAR_MIN[timeframe] ?? SESSION_MIN
  const minsLeft = tradingMinutesUntil(expiryISO, now)
  const ivFrac  = toFraction(iv) ?? 0.14

  // Hold window: up to maxBars bars, never past expiry
  const holdMin  = minsLeft == null ? maxBars * barMin : Math.min(minsLeft, maxBars * barMin)
  const holdBars = Math.max(1, Math.floor(holdMin / barMin))
  if (minsLeft != null && minsLeft < barMin) {
    reasons.push(minsLeft <= 0 ? 'This option has expired' : 'Less than one candle left before expiry')
  }

  // 1-sigma index move over the hold window, from the market's own implied volatility.
  // Price touches about 0.67 sigma in either direction half the time (reflection
  // principle), so that is the largest target we call realistic.
  const expectedMove  = spot * ivFrac * Math.sqrt(Math.max(holdMin, 1) / YEAR_MIN)
  const reachableMove = REACH_SIGMA * expectedMove

  // Stop: 1 ATR, but never more than MAX_PREMIUM_STOP_PCT of the premium
  const d = Math.min(1, Math.max(0.05, Math.abs(delta ?? 0.5)))
  const stopCapPts = premium > 0 ? (premium * MAX_PREMIUM_STOP_PCT) / d : Infinity
  let stopPts   = Math.min(stopATR * atr, stopCapPts)
  // Target: 1 ATR, but never more than the move the market usually makes in the window
  let targetPts = Math.min(targetATR * atr, reachableMove)
  const targetCapped = targetPts < targetATR * atr
  // Never risk more index points than the target asks for
  if (targetPts < stopPts) stopPts = targetPts

  // Time decay: ATM time value shrinks roughly with sqrt(time left). Charge the decay
  // of half the hold window to the target (the average time to reach it).
  let decay = 0
  let premiumTarget = null
  let premiumSL = null
  if (premium > 0) {
    const intrinsic = strike ? Math.max(0, side === 'PUT' ? strike - spot : spot - strike) : 0
    const timeValue = Math.max(0, premium - intrinsic)
    if (minsLeft > 0) {
      const frac = Math.min(1, (holdMin / 2) / minsLeft)
      decay = timeValue * (1 - Math.sqrt(1 - frac))
    }
    const tick = (v) => Math.round(v * 20) / 20
    premiumTarget = tick(premium + d * targetPts - decay)
    premiumSL     = Math.max(0.05, tick(premium - d * stopPts))
    const gain = premiumTarget - premium
    const loss = premium - premiumSL
    if (gain <= 0) reasons.push('Time decay is bigger than the realistic gain before expiry')
    else if (gain < 0.5 * loss) reasons.push(`Reward ₹${gain.toFixed(2)} is less than half the risk ₹${loss.toFixed(2)} after time decay`)
  }

  return {
    ok: reasons.length === 0,
    reasons,
    minsLeft,
    holdMin,
    holdBars,
    expectedMove,
    reachableMove,
    iv: ivFrac,
    delta: d,
    targetPts,
    stopPts,
    targetCapped,
    // ATR multiples, so the backtest tests exactly these levels
    targetATR: targetPts / atr,
    stopATR:   stopPts / atr,
    decay: Math.round(decay * 100) / 100,
    premium: premium > 0 ? premium : null,
    premiumTarget,
    premiumSL,
  }
}
