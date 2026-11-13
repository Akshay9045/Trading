// Options Signal Engine — generates CALL/PUT recommendations from a base signal

import { tradeApi } from './tradeApi'

const STRIKE_INTERVALS = {
  NIFTY:     50,
  BANKNIFTY: 100,
  SENSEX:    100,
  DEFAULT:   50,
}

const getStrikeInterval = (symbol) =>
  STRIKE_INTERVALS[symbol] || STRIKE_INTERVALS.DEFAULT

// Round price to nearest valid strike
export const getATMStrike = (price, symbol) => {
  const interval = getStrikeInterval(symbol)
  return Math.round(price / interval) * interval
}

export const getITMStrike = (price, symbol, direction) => {
  const interval = getStrikeInterval(symbol)
  const atm = getATMStrike(price, symbol)
  return direction === 'CALL' ? atm - interval : atm + interval
}

export const getOTMStrike = (price, symbol, direction) => {
  const interval = getStrikeInterval(symbol)
  const atm = getATMStrike(price, symbol)
  return direction === 'CALL' ? atm + interval : atm - interval
}

// NSE trading holidays (YYYY-MM-DD local date)
const NSE_HOLIDAYS = new Set([
  // 2026
  '2026-01-26', // Republic Day
  '2026-03-02', // Mahashivratri
  '2026-03-25', // Holi
  '2026-04-02', // Ram Navami
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Ambedkar Jayanti / Baisakhi
  '2026-05-01', // Maharashtra Day
  '2026-06-03', // Eid al-Adha (Bakri Eid) day 1
  '2026-06-04', // Eid al-Adha day 2
  '2026-06-08', // Eid al-Adha day 3 (observed Monday)
  '2026-07-06', // Muharram
  '2026-08-15', // Independence Day
  '2026-09-15', // Milad-un-Nabi
  '2026-10-02', // Gandhi Jayanti
  '2026-10-22', // Dussehra
  '2026-11-11', // Diwali Laxmi Puja
  '2026-11-12', // Diwali Balipratipada
  '2026-11-24', // Guru Nanak Jayanti
  '2026-12-25', // Christmas
])

// Use local date string (not UTC) to avoid IST timezone offset bugs
const localDateKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isNSETradingDay = (date) => {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  return !NSE_HOLIDAYS.has(localDateKey(date))
}

// NIFTY weekly options expire on TUESDAY (SEBI/NSE, effective 1 Sep 2025).
// Monthly = last Tuesday of the month.
// If the Tuesday is an exchange holiday, expiry moves to the PREVIOUS trading day.
const TUESDAY = 2

// Walk BACKWARD to the previous trading day if `date` is a holiday/weekend
const rollBackToTradingDay = (date) => {
  while (!isNSETradingDay(date)) {
    date.setDate(date.getDate() - 1)
  }
  return date
}

// Calculated fallback — used only when Groww's instrument list can't be reached.
// NIFTY: next weekly Tuesday. BANKNIFTY: monthly only (last Tuesday).
const calcNextExpiryDate = (symbol) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (symbol === 'BANKNIFTY') return calcMonthlyExpiryDate()
  const baseOffset = (TUESDAY - today.getDay() + 7) % 7   // days to upcoming Tuesday (0 if today)
  // Find the first Tuesday-based expiry that lands today or later (after holiday roll-back)
  for (let week = 0; week < 8; week++) {
    const tuesday = new Date(today)
    tuesday.setDate(today.getDate() + baseOffset + week * 7)
    const expiry = rollBackToTradingDay(new Date(tuesday))
    if (expiry >= today) return expiry
  }
  return rollBackToTradingDay(new Date(today.getTime() + baseOffset * 86400000))
}

// Last Tuesday of the given month (year, month 0-indexed), rolled back if a holiday
const lastTuesdayOfMonth = (year, month) => {
  const d = new Date(year, month + 1, 0)   // last calendar day of the month
  while (d.getDay() !== TUESDAY) d.setDate(d.getDate() - 1)
  return rollBackToTradingDay(d)
}

const calcMonthlyExpiryDate = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let expiry = lastTuesdayOfMonth(today.getFullYear(), today.getMonth())
  if (expiry < today) {
    const nextMonth = today.getMonth() + 1
    const year  = nextMonth > 11 ? today.getFullYear() + 1 : today.getFullYear()
    expiry = lastTuesdayOfMonth(year, nextMonth % 12)
  }
  return expiry
}

// ── Real expiries from Groww's instrument list (server/instruments.js) ───────
// NSE moves expiries for holidays and BANKNIFTY is monthly-only, so the listed
// dates are the source of truth. Loaded once per symbol, shared by every caller.
const EXPIRY_UNDERLYINGS = ['NIFTY', 'BANKNIFTY']
const RETRY_AFTER_MS = 60_000
const realExpiries = {}       // symbol → ['YYYY-MM-DD', ...] sorted
const pendingExpiries = {}    // symbol → Promise
const failedAt = {}           // symbol → ms timestamp of last failed load
const expiryListeners = new Set()

const isoToDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const upcomingRealExpiries = (symbol) => {
  const list = realExpiries[symbol]
  if (!list) return null
  const today = localDateKey(new Date())
  const upcoming = list.filter(e => e >= today)
  return upcoming.length ? upcoming : null
}

// Fetch the listed expiries for `symbol`. Resolves to the list, or null when the
// server is unreachable (callers then use the calculated fallback).
export const loadExpiries = (symbol) => {
  if (!EXPIRY_UNDERLYINGS.includes(symbol)) return Promise.resolve(null)
  if (upcomingRealExpiries(symbol)) return Promise.resolve(upcomingRealExpiries(symbol))
  if (pendingExpiries[symbol]) return pendingExpiries[symbol]
  if (failedAt[symbol] && Date.now() - failedAt[symbol] < RETRY_AFTER_MS) return Promise.resolve(null)

  pendingExpiries[symbol] = tradeApi.expiries(symbol)
    .then(({ expiries }) => {
      if (!Array.isArray(expiries) || !expiries.length) throw new Error('no upcoming expiries listed')
      realExpiries[symbol] = [...expiries].sort()
      delete failedAt[symbol]
      expiryListeners.forEach(fn => fn())
      return upcomingRealExpiries(symbol)
    })
    .catch(err => {
      failedAt[symbol] = Date.now()
      console.warn(`[optionsEngine] ${symbol} expiries unavailable, using calculated dates:`, err.message)
      return null
    })
    .finally(() => { delete pendingExpiries[symbol] })
  return pendingExpiries[symbol]
}

// Subscribe to "real expiries arrived" — returns an unsubscribe function.
export const subscribeExpiries = (fn) => {
  expiryListeners.add(fn)
  return () => expiryListeners.delete(fn)
}

// 'groww' when the dates come from the instrument list, else 'calculated'
export const getExpirySource = (symbol) => upcomingRealExpiries(symbol) ? 'groww' : 'calculated'

const getNextExpiryDate = (symbol = 'NIFTY') => {
  const real = upcomingRealExpiries(symbol)
  if (real) return isoToDate(real[0])
  loadExpiries(symbol)   // fire-and-forget; subscribers re-render when it lands
  return calcNextExpiryDate(symbol)
}

const formatExpiry = (d) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export const getNextExpiry = (symbol = 'NIFTY') => formatExpiry(getNextExpiryDate(symbol))

// ISO date (YYYY-MM-DD) of the next expiry — for Groww option-chain API calls
export const getNextExpiryISO = (symbol = 'NIFTY') => localDateKey(getNextExpiryDate(symbol))

// Like getNextExpiryISO, but waits for the instrument list first so API calls
// never go to a calculated (possibly non-existent) expiry when the real one is available.
export const resolveNextExpiryISO = async (symbol = 'NIFTY') => {
  await loadExpiries(symbol)
  return getNextExpiryISO(symbol)
}

const getDaysToNextExpiry = (symbol) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = getNextExpiryDate(symbol)
  return Math.max(1, Math.round((expiry - today) / 86400000))
}

// Monthly expiry = the last listed expiry of the first month that still has one
export const getMonthlyExpiry = (symbol = 'NIFTY') => {
  const real = upcomingRealExpiries(symbol)
  if (real) {
    const month = real[0].slice(0, 7)
    return formatExpiry(isoToDate(real.filter(e => e.startsWith(month)).pop()))
  }
  loadExpiries(symbol)
  return formatExpiry(calcMonthlyExpiryDate())
}

// VIX-based Black-Scholes approximation for option premium
// Formula: premium ≈ price × (vix/100) × sqrt(T) × 0.4
// where T = daysToExpiry/365, vix from market (default 14.61)
const estimatePremium = (price, strike, daysToExpiry, type, vix = 10.2) => {
  const intrinsic = type === 'CALL'
    ? Math.max(0, price - strike)
    : Math.max(0, strike - price)
  const T = daysToExpiry / 365
  const moneyness = Math.abs(price - strike) / price
  // ATM options get full time value; OTM options get less
  const atmFactor = Math.exp(-moneyness * moneyness * 50)
  const timeValue = price * (vix / 100) * Math.sqrt(T) * 0.4 * atmFactor
  return Math.max(5, Math.round(intrinsic + timeValue))
}

// Option buyers lose at most this share of the premium at the stop. Without a cap a
// wide (Daily ATR) spot stop maps to a premium stop near ₹0 — i.e. no stop at all.
export const MAX_PREMIUM_STOP_PCT = 0.35

// Option target/SL from the underlying's move: premium ± delta × spot points,
// with the stop capped at MAX_PREMIUM_STOP_PCT of the premium.
const premiumExits = (premium, rawDelta, pointsTarget, pointsSL) => {
  const delta = rawDelta != null ? Math.abs(rawDelta) : 0.5
  const capped = premium * (1 - MAX_PREMIUM_STOP_PCT)
  return {
    delta,
    deltaBasis:    rawDelta != null ? 'chain-delta' : 'approx-delta-0.5',
    premiumTarget: Math.max(premium + 1, Math.round(premium + delta * pointsTarget)),
    premiumSL:     Math.max(1, Math.round(Math.max(capped, premium - delta * pointsSL))),
    stopCapped:    premium - delta * pointsSL < capped,
  }
}

// Buy / target / stop premiums for one strike. Uses the chain's LTP and delta when
// available (source 'live'), else the synthetic estimate (source 'estimated').
export const getOptionPriceLevels = ({ symbol, spot, strike, optionType, pointsTarget, pointsSL, optionChain = null, vix }) => {
  const leg      = optionChain?.strikes?.get?.(strike)
  const ltp      = leg ? (optionType === 'CALL' ? leg.callLtp : leg.putLtp) : null
  const rawDelta = leg ? (optionType === 'CALL' ? leg.callDelta : leg.putDelta) : null
  const isLive   = ltp != null && ltp > 0
  const premium  = isLive
    ? ltp
    : estimatePremium(spot, strike, getDaysToNextExpiry(symbol), optionType, optionChain?.atmIV ?? vix ?? 14.61)
  const exits    = premiumExits(premium, rawDelta, pointsTarget, pointsSL)
  // Exact levels on the option's ₹0.05 tick, not rounded to whole rupees
  const toTick   = (v) => Math.round(v * 20) / 20
  return {
    premium, source: isLive ? 'live' : 'estimated', ...exits,
    premiumTarget: toTick(premium + exits.delta * pointsTarget),
    premiumSL:     Math.max(0.05, toTick(Math.max(premium * (1 - MAX_PREMIUM_STOP_PCT), premium - exits.delta * pointsSL))),
  }
}

// Untested setups (too little history to backtest) need this formula score to grade OK.
const MIN_CONVICTION = 65

// How much to trust a pick. STRONG/OK need a positive backtested edge (or, untested,
// a high formula score); everything else is WEAK — still shown, clearly labelled.
const gradeSignal = ({ calibrated, expectancy, backtestWinRate, confidence }) => {
  if (calibrated) {
    if (expectancy != null && expectancy > 0) return backtestWinRate >= 50 ? 'STRONG' : 'OK'
    return 'WEAK'
  }
  return confidence >= MIN_CONVICTION ? 'OK' : 'WEAK'
}

// Main function: converts a base signal into an options trade.
// `optionChain` (optional) is the normalized chain from apiService.fetchOptionChain:
//   { strikes: Map<strike, {callLtp, callIV, putLtp, putIV}>, atmIV }
// When provided, real per-strike LTP and IV are used; otherwise we fall back to
// the synthetic estimate. premiumSource on the result tells you which was used.
export const buildOptionsSignal = (baseSignal, symbol, quote, optionChain = null) => {
  if (!baseSignal || !quote) return null

  const { type, entry: candleClose, target: candleTarget, stopLoss: candleStop, confidence, reasons, rrRatio, indicators,
          calibrated, expectancy, backtestWinRate, backtestSamples, bucketWinRate, bucketSamples } = baseSignal

  // Always a CALL or PUT pick (callers pass an always-signal from useDirectionalSignal).
  // A HOLD can only come from a caller using the filtered engine — no pick to show.
  if (type !== 'BUY' && type !== 'SELL') return null

  // The signal's levels are anchored on the last candle close (yesterday on the Daily).
  // Re-anchor them on the live price so the strike and "buy at" are for the market now;
  // the point distances to target and stop stay the same.
  const live     = Number(quote?.price)
  const entry    = Number.isFinite(live) && live > 0 ? live : candleClose
  const shift    = entry - candleClose
  const target   = candleTarget + shift
  const stopLoss = candleStop + shift

  // Win chance: the real backtested win rate when there's enough history, else the
  // engine's formula score (labelled untested in the UI).
  const grade     = gradeSignal({ calibrated, expectancy, backtestWinRate, confidence })
  const winChance = calibrated && backtestWinRate != null ? backtestWinRate : confidence

  const optionType    = type === 'BUY' ? 'CALL' : 'PUT'
  const atm           = getATMStrike(entry, symbol)
  const itmStrike     = getITMStrike(entry, symbol, optionType)
  const otmStrike     = getOTMStrike(entry, symbol, optionType)
  const daysToExpiry  = getDaysToNextExpiry(symbol)

  // Prefer the live chain's ATM implied volatility; fall back to quote VIX.
  const vix           = optionChain?.atmIV ?? quote?.vix ?? 14.61

  // Real LTP for a strike from the chain (correct leg for CALL/PUT), or null.
  const chainLTP = (strike) => {
    const leg = optionChain?.strikes?.get?.(strike)
    if (!leg) return null
    const ltp = optionType === 'CALL' ? leg.callLtp : leg.putLtp
    return ltp != null && ltp > 0 ? Math.round(ltp) : null
  }

  // Use real premium when available, else the synthetic estimate.
  const premiumFor = (strike) =>
    chainLTP(strike) ?? estimatePremium(entry, strike, daysToExpiry, optionType, vix)

  const liveAtm       = chainLTP(atm)
  const premiumSource = liveAtm != null ? 'live' : 'estimated'
  const atmPremium    = premiumFor(atm)
  const itmPremium    = premiumFor(itmStrike)
  const otmPremium    = premiumFor(otmStrike)

  // Points move on the underlying
  const pointsTarget = Math.abs(target - entry)
  const pointsSL     = Math.abs(entry - stopLoss)

  // Option target/SL via DELTA, not a flat "40% of premium" rule. Delta = how much
  // the premium moves per 1 point of spot. Use the chain's real delta when present,
  // else ~0.5 for an ATM option. premium ≈ atmPremium ± delta × spot-move.
  const atmLeg     = optionChain?.strikes?.get?.(atm)
  const rawDelta   = atmLeg ? (optionType === 'CALL' ? atmLeg.callDelta : atmLeg.putDelta) : null
  const { delta, deltaBasis, premiumTarget, premiumSL, stopCapped } = premiumExits(atmPremium, rawDelta, pointsTarget, pointsSL)

  return {
    action:         type === 'BUY' ? 'BUY CALL' : 'BUY PUT',
    optionType,
    symbol,
    expiry:         getNextExpiry(symbol),
    expiryISO:      getNextExpiryISO(symbol),
    expirySource:   getExpirySource(symbol),
    monthlyExpiry:  getMonthlyExpiry(symbol),

    // Underlying levels
    spotEntry:      entry,
    spotTarget:     target,
    spotStopLoss:   stopLoss,
    pointsTarget:   parseFloat(pointsTarget.toFixed(0)),
    pointsSL:       parseFloat(pointsSL.toFixed(0)),

    // Strikes
    atmStrike:      atm,
    itmStrike,
    otmStrike,
    recommendedStrike: atm,   // ATM is safest for most traders

    // Premiums
    atmPremium,
    itmPremium,
    otmPremium,
    premiumTarget,
    premiumSL,
    premiumSource,                 // 'live' (real Groww LTP) or 'estimated'
    stopCapped,                    // true when the stop was tightened to MAX_PREMIUM_STOP_PCT
    deltaBasis,                    // 'chain-delta' (real) or 'approx-delta-0.5'
    impliedVol: optionChain?.atmIV != null
      ? parseFloat(optionChain.atmIV.toFixed(1))
      : null,

    // Calibration — real backtested numbers carried through for the UI
    calibrated,
    backtestWinRate,
    backtestSamples,
    bucketWinRate,
    bucketSamples,
    expectancy,
    grade,                         // 'STRONG' | 'OK' | 'WEAK'
    winChance,                     // % — backtested when calibrated, else formula score
    winChanceBasis: calibrated && backtestWinRate != null ? 'backtested' : 'untested',

    confidence,
    rrRatio,
    reasons,
    indicators,
    timestamp: baseSignal.timestamp,
  }
}
