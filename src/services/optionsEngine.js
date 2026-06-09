// Options Signal Engine — generates CALL/PUT recommendations from a base signal

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

const getNextExpiryDate = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
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

export const getNextExpiry = () =>
  getNextExpiryDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

// ISO date (YYYY-MM-DD) of the next weekly expiry — for Groww option-chain API calls
export const getNextExpiryISO = () => {
  const d  = getNextExpiryDate()
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const getDaysToNextExpiry = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = getNextExpiryDate()
  return Math.max(1, Math.round((expiry - today) / 86400000))
}

// Last Tuesday of the given month (year, month 0-indexed), rolled back if a holiday
const lastTuesdayOfMonth = (year, month) => {
  const d = new Date(year, month + 1, 0)   // last calendar day of the month
  while (d.getDay() !== TUESDAY) d.setDate(d.getDate() - 1)
  return rollBackToTradingDay(d)
}

export const getMonthlyExpiry = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let expiry = lastTuesdayOfMonth(today.getFullYear(), today.getMonth())
  if (expiry < today) {
    const nextMonth = today.getMonth() + 1
    const year  = nextMonth > 11 ? today.getFullYear() + 1 : today.getFullYear()
    expiry = lastTuesdayOfMonth(year, nextMonth % 12)
  }
  return expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
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

// Professional conviction gate — backtested: only setups ≥65% confidence are net-positive.
// Below this, a pro waits rather than overtrade mediocre signals.
const MIN_CONVICTION = 65

// Main function: converts a base signal into an options trade
export const buildOptionsSignal = (baseSignal, symbol, quote) => {
  if (!baseSignal || !quote) return null

  const { type, entry, target, stopLoss, confidence, reasons, rrRatio, indicators } = baseSignal
  if (type === 'HOLD' || confidence < MIN_CONVICTION) {
    return {
      action: 'WAIT',
      optionType: null,
      symbol,
      price: entry,
      confidence,
      reasons,
      indicators,
      message: type === 'HOLD'
        ? 'No directional bias — market consolidating. Wait for a breakout.'
        : `Conviction ${confidence}% is below the ${MIN_CONVICTION}% professional threshold. No high-quality setup right now — waiting is the trade.`,
    }
  }

  const optionType    = type === 'BUY' ? 'CALL' : 'PUT'
  const atm           = getATMStrike(entry, symbol)
  const itmStrike     = getITMStrike(entry, symbol, optionType)
  const otmStrike     = getOTMStrike(entry, symbol, optionType)
  const vix           = quote?.vix || 14.61
  const daysToExpiry  = getDaysToNextExpiry()
  const atmPremium    = estimatePremium(entry, atm,       daysToExpiry, optionType, vix)
  const itmPremium    = estimatePremium(entry, itmStrike, daysToExpiry, optionType, vix)
  const otmPremium    = estimatePremium(entry, otmStrike, daysToExpiry, optionType, vix)

  // Option target/SL in premium terms
  const premiumTarget = Math.floor(atmPremium * (1 + (rrRatio * 0.5)))
  const premiumSL     = Math.floor(atmPremium * 0.4)        // 40% of premium as stop loss

  // Points move
  const pointsTarget = Math.abs(target - entry)
  const pointsSL     = Math.abs(entry - stopLoss)

  return {
    action:         type === 'BUY' ? 'BUY CALL' : 'BUY PUT',
    optionType,
    symbol,
    expiry:         getNextExpiry(),
    monthlyExpiry:  getMonthlyExpiry(),

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

    confidence,
    rrRatio,
    reasons,
    indicators,
    timestamp: baseSignal.timestamp,
  }
}
