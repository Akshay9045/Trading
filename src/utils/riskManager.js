// Risk management — position sizing for option buying + daily-loss tracking.
// This protects capital: it caps how much you risk per trade and stops you trading
// once you've lost your daily budget. None of this predicts the market — it just
// keeps a bad streak from blowing up the account.

// NSE index option lot sizes (contract multiplier). These are revised periodically
// by SEBI/NSE — VERIFY against the current circular before trading real money.
export const LOT_SIZES = { NIFTY: 75, BANKNIFTY: 35, SENSEX: 20, DEFAULT: 75 }
export const getLotSize = (symbol) => LOT_SIZES[symbol] || LOT_SIZES.DEFAULT

// Position sizing for BUYING an option that has a premium stop-loss.
//   capital      total trading capital (₹)
//   riskPct      % of capital to risk on this one trade (e.g. 1 = 1%)
//   entryPremium per-share premium paid at entry
//   slPremium    per-share premium at the stop-loss
//   lotSize      contract multiplier (shares per lot)
// Returns suggested lots within the risk budget plus the rupee figures.
export const sizePosition = ({ capital, riskPct, entryPremium, slPremium, lotSize }) => {
  const safe = (n) => (Number.isFinite(n) && n > 0 ? n : 0)
  capital      = safe(capital)
  entryPremium = safe(entryPremium)
  lotSize      = safe(lotSize)
  const pct    = Number.isFinite(riskPct) && riskPct > 0 ? riskPct : 0

  const riskBudget   = capital * (pct / 100)                       // ₹ willing to lose on this trade
  const perShareRisk = Math.max(0, entryPremium - safe(slPremium)) // premium lost per share if stopped
  const perLotRisk   = perShareRisk * lotSize                      // ₹ lost per lot if stopped
  const lots         = perLotRisk > 0 ? Math.floor(riskBudget / perLotRisk) : 0
  const capitalDeployed = lots * entryPremium * lotSize            // ₹ needed to buy
  const totalRisk       = lots * perLotRisk                        // actual ₹ at risk at the stop
  const maxLossIfZero   = lots * entryPremium * lotSize            // worst case: option expires worthless

  return {
    riskBudget:      Math.round(riskBudget),
    perShareRisk:    Math.round(perShareRisk),
    perLotRisk:      Math.round(perLotRisk),
    lots,
    lotSize,
    capitalDeployed: Math.round(capitalDeployed),
    totalRisk:       Math.round(totalRisk),
    maxLossIfZero:   Math.round(maxLossIfZero),
    // Flags for the UI
    affordable:      lots >= 1,
    deploysOverHalf: capital > 0 && capitalDeployed > capital * 0.5,  // over-concentrated
  }
}

// ── Daily-loss guard (localStorage-backed) ──────────────────────────────────
const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const LOG_PREFIX = 'risk-log-'

export const loadTodayLog = () => {
  try {
    const raw = localStorage.getItem(LOG_PREFIX + todayKey())
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export const saveTodayLog = (entries) => {
  try { localStorage.setItem(LOG_PREFIX + todayKey(), JSON.stringify(entries)) } catch { /* ignore */ }
}

// Sum of today's realized P&L (negative = net loss)
export const dayPnL = (entries) => entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

// True when the day's net loss has reached/exceeded the limit (limit is a positive ₹)
export const lossLimitHit = (entries, dailyLossLimit) => {
  const limit = Number(dailyLossLimit)
  if (!Number.isFinite(limit) || limit <= 0) return false
  return dayPnL(entries) <= -limit
}

// ── Settings persistence ─────────────────────────────────────────────────────
const SETTINGS_KEY = 'risk-settings'
export const DEFAULT_SETTINGS = { capital: 100000, riskPct: 1, dailyLossLimit: 3000 }

export const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
  } catch { return { ...DEFAULT_SETTINGS } }
}
export const saveSettings = (s) => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
