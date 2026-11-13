// ── Trading engine + /api/trade/* routes ───────────────────────────────────
// Flow for every entry (paper or live, same code path):
//   1. Validate against hard limits below (server-side — the UI can't bypass them)
//   2. Place a BUY LIMIT entry (a "market" entry is a marketable limit, capped +3% over LTP)
//   3. Background loop waits for the fill, then attaches ONE OCO exit
//      (target LIMIT + stop-loss SL) for the filled quantity
// The app starts in PAPER mode on every server start. LIVE needs both
// TRADING_LIVE_ENABLED=true in .env and an explicit typed confirmation in the UI.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { growwAccessToken } from './groww.js'
import { liveBroker } from './liveBroker.js'
import { paperBroker } from './paperBroker.js'
import { getOptionLtp, priceSource } from './prices.js'
import { SUPPORTED_UNDERLYINGS, getExpiries, getContract, getContractBySymbol, getStrikes, ensureInstruments, todayIST } from './instruments.js'
import { dataPath } from './paths.js'

const BRACKETS_PATH = dataPath('brackets.json')

const cfg = {
  liveEnabled: false,
  maxLots: 1,
  maxLossPerTrade: 2000,
  dailyLossLimit: 5000,
  paperCapital: 100000,
  localOnly: true,
  allowedOrigins: [],
}

let mode = 'paper'
const brokers = { paper: paperBroker, live: liveBroker }
const broker = () => brokers[mode]

const numEnv = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)

export function configureTrading(env) {
  cfg.liveEnabled     = String(env.TRADING_LIVE_ENABLED || '').toLowerCase() === 'true'
  cfg.maxLots         = Math.floor(numEnv(env.TRADE_MAX_LOTS, cfg.maxLots))
  cfg.maxLossPerTrade = numEnv(env.TRADE_MAX_LOSS_PER_TRADE, cfg.maxLossPerTrade)
  cfg.dailyLossLimit  = numEnv(env.TRADE_DAILY_LOSS_LIMIT, cfg.dailyLossLimit)
  cfg.paperCapital    = numEnv(env.TRADE_PAPER_CAPITAL, cfg.paperCapital)
  paperBroker.configure({ capital: cfg.paperCapital })
  // Deployed (APP_PASSWORD set): the login in auth.js protects these routes, so the
  // localhost-only check is replaced by an optional allow-list of site origins.
  cfg.localOnly      = !env.APP_PASSWORD
  cfg.allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean)
  mode = 'paper'
}

// ── Helpers ────────────────────────────────────────────────────────────────
const roundTick = (px, tick = 0.05) => Number((Math.round(px / tick) * tick).toFixed(2))
const floorTick = (px, tick = 0.05) => Number((Math.floor(px / tick + 1e-9) * tick).toFixed(2))
const ceilTick  = (px, tick = 0.05) => Number((Math.ceil(px / tick - 1e-9) * tick).toFixed(2))

// Groww order_reference_id / OCO reference_id: 8–20 alphanumeric, ≤ 2 hyphens
const newRef = (prefix) => `${prefix}${todayIST().replace(/-/g, '').slice(2)}${crypto.randomBytes(4).toString('hex')}`.slice(0, 20)

// Stop-limit price under the trigger: 10% buffer so a fast-falling option still fills.
const stopLimitFor = (trigger, tick) => Math.max(tick, floorTick(trigger * 0.90, tick))

function istNow() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000)
  return { day: d.getUTCDay(), mins: d.getUTCHours() * 60 + d.getUTCMinutes() }
}
// New entries only 09:15–15:20 IST, Mon–Fri (exchange holidays are rejected by Groww itself).
export function marketOpenForEntries() {
  const { day, mins } = istNow()
  return day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 20
}

class TradeError extends Error { constructor(msg, status = 400) { super(msg); this.status = status } }

// ── Brackets (entry → OCO protection), persisted so a restart keeps watching ──
let brackets = []
try { brackets = JSON.parse(fs.readFileSync(BRACKETS_PATH, 'utf8')) } catch { brackets = [] }
const saveBrackets = () => {
  fs.mkdirSync(path.dirname(BRACKETS_PATH), { recursive: true })
  // Keep today's and anything still active
  const today = todayIST()
  brackets = brackets.filter(b => b.createdAt?.slice(0, 10) >= today || !['CLOSED', 'CANCELLED'].includes(b.status))
  fs.writeFileSync(BRACKETS_PATH, JSON.stringify(brackets, null, 2))
}
const ACTIVE_BRACKET = new Set(['WAITING_FILL', 'PROTECTING', 'PROTECTED', 'UNPROTECTED'])

async function protect(b) {
  const br = brokers[b.mode]
  b.status = 'PROTECTING'; saveBrackets()
  try {
    const pos = (await br.getPositions()).find(p => p.tradingSymbol === b.tradingSymbol)
    const netQty = pos?.qty || 0
    const qty = Math.min(b.filledQty, netQty)
    if (qty <= 0) { b.status = 'CLOSED'; b.note = 'No open position left to protect'; saveBrackets(); return }
    const r = await br.createOco({
      tradingSymbol: b.tradingSymbol, qty, netQty,
      target: b.target, stopLoss: b.stopLoss, stopLimit: b.stopLimit,
      ref: b.ocoRef,   // fixed per bracket → Groww treats a retry as the same OCO (idempotent)
    })
    Object.assign(b, { status: 'PROTECTED', ocoId: r.ocoId, protectedQty: qty, error: null })
    console.log(`\x1b[32m[Trade:${b.mode}]\x1b[0m ${b.tradingSymbol} protected — SL ${b.stopLoss} / target ${b.target}`)
  } catch (e) {
    Object.assign(b, { status: 'UNPROTECTED', error: e.message })
    console.warn(`\x1b[31m[Trade:${b.mode}]\x1b[0m ${b.tradingSymbol} NOT protected: ${e.message}`)
  }
  saveBrackets()
}

async function stepBracket(b) {
  const br = brokers[b.mode]
  if (b.status === 'WAITING_FILL') {
    const o = await br.getOrder(b.entryOrderId)
    b.filledQty = o.filledQty
    if (o.status === 'EXECUTED') { b.filledQty = o.filledQty || b.qty; await protect(b) }
    else if (o.status === 'CANCELLED' || o.status === 'REJECTED') {
      if (o.filledQty > 0) await protect(b)
      else { b.status = o.status === 'CANCELLED' ? 'CANCELLED' : 'CLOSED'; b.note = o.remark || `Entry ${o.status.toLowerCase()}`; saveBrackets() }
    }
  } else if (b.status === 'PROTECTED' && Date.now() - (b.lastOcoCheck || 0) > 10_000) {
    b.lastOcoCheck = Date.now()
    const active = await br.getOcos()
    if (!active.some(o => o.id === b.ocoId)) { b.status = 'CLOSED'; b.note = 'Stop-loss or target hit (or expired)'; saveBrackets() }
  }
}

let loopBusy = false
async function loop() {
  if (loopBusy) return
  loopBusy = true
  try {
    if (paperBroker.hasOpenWork()) await paperBroker.tick().catch(e => console.warn('[Trade:paper] tick:', e.message))
    for (const b of brackets.filter(x => ['WAITING_FILL', 'PROTECTED'].includes(x.status))) {
      await stepBracket(b).catch(e => { b.lastError = e.message })
    }
  } finally {
    loopBusy = false
  }
}


// ── Account summary for the current mode ───────────────────────────────────
async function dayPnl(br) {
  const positions = await br.getPositions()
  const open = positions.filter(p => p.qty !== 0).map(p => p.tradingSymbol)
  const ltps = open.length ? await getOptionLtp(open).catch(() => ({})) : {}
  let realised = 0, unrealised = 0
  for (const p of positions) {
    realised += p.realisedPnl || 0
    const ltp = ltps[p.tradingSymbol]
    if (p.qty !== 0 && ltp != null) unrealised += (ltp - p.avgPrice) * p.qty
  }
  return { positions, ltps, realised, unrealised, total: realised + unrealised }
}

// ── Actions ────────────────────────────────────────────────────────────────
const recentRefs = new Map()   // clientRef → result (double-click / retry protection)

async function placeEntry(body) {
  const { underlying, expiry, optionType, priceMode, clientRef } = body
  const lots = Number(body.lots), strike = Number(body.strike)
  const stopLoss = Number(body.stopLoss), target = Number(body.target)

  if (clientRef && recentRefs.has(clientRef)) return recentRefs.get(clientRef)

  if (mode === 'live') {
    if (!cfg.liveEnabled) throw new TradeError('Live trading is disabled in .env (TRADING_LIVE_ENABLED)', 403)
    if (!marketOpenForEntries()) throw new TradeError('Market closed for new entries (09:15–15:20 IST, Mon–Fri)')
  }
  if (!SUPPORTED_UNDERLYINGS.includes(underlying)) throw new TradeError(`Unsupported underlying ${underlying}`)
  if (optionType !== 'CE' && optionType !== 'PE') throw new TradeError('optionType must be CE or PE')

  const c = await getContract(underlying, expiry, strike, optionType)
  if (!c) throw new TradeError(`${underlying} ${expiry} ${strike} ${optionType} is not a listed contract`)
  if (!c.buyAllowed) throw new TradeError(`${c.tradingSymbol} is not open for buying`)

  if (!Number.isInteger(lots) || lots < 1) throw new TradeError('Lots must be a whole number ≥ 1')
  if (lots > cfg.maxLots) throw new TradeError(`Max ${cfg.maxLots} lot(s) per order (TRADE_MAX_LOTS)`)
  const qty = lots * c.lotSize
  if (qty > c.freezeQty) throw new TradeError(`Quantity ${qty} exceeds exchange freeze limit ${c.freezeQty}`)

  const br = broker()
  const ltp = (await getOptionLtp([c.tradingSymbol]))[c.tradingSymbol]
  if (ltp == null || !(ltp > 0)) throw new TradeError('No live price for this contract (Groww and NSE both unavailable) — cannot price the order', 502)

  let entryRef, limitPrice
  if (priceMode === 'MARKET') {
    entryRef   = ltp
    limitPrice = ceilTick(ltp * 1.03 + c.tickSize, c.tickSize)   // marketable, but caps slippage at ~3%
  } else {
    limitPrice = roundTick(Number(body.limitPrice), c.tickSize)
    if (!(limitPrice > 0)) throw new TradeError('Enter a limit price')
    if (Math.abs(limitPrice - ltp) / ltp > 0.2) throw new TradeError(`Limit ₹${limitPrice} is more than 20% away from LTP ₹${ltp} — check for a typo`)
    entryRef = limitPrice
  }

  const sl = roundTick(stopLoss, c.tickSize), tgt = roundTick(target, c.tickSize)
  if (!(sl > 0) || !(tgt > 0)) throw new TradeError('Stop-loss and target are required')
  if (!(sl < entryRef && entryRef < tgt)) throw new TradeError(`Need stop-loss < entry < target (got ${sl} / ${entryRef} / ${tgt})`)
  if (!(sl < ltp)) throw new TradeError(`Stop-loss ₹${sl} is at/above the current price ₹${ltp} — it would trigger immediately`)

  const riskRs = (entryRef - sl) * qty
  if (riskRs > cfg.maxLossPerTrade) throw new TradeError(`Loss at stop ₹${Math.round(riskRs)} exceeds your max ₹${cfg.maxLossPerTrade} per trade (TRADE_MAX_LOSS_PER_TRADE)`)

  const pnl = await dayPnl(br)
  if (pnl.total <= -cfg.dailyLossLimit) throw new TradeError(`Daily loss limit ₹${cfg.dailyLossLimit} reached (today ₹${Math.round(pnl.total)}). No new entries today.`)

  const funds = await br.getFunds().catch(() => null)
  if (funds?.available != null && limitPrice * qty > funds.available) {
    throw new TradeError(`Needs ₹${Math.round(limitPrice * qty)} but only ₹${Math.round(funds.available)} available`)
  }

  const ref = newRef('E')
  const r = await br.placeOrder({ tradingSymbol: c.tradingSymbol, side: 'BUY', qty, orderType: 'LIMIT', price: limitPrice, ref })

  const b = {
    id: ref, mode, tradingSymbol: c.tradingSymbol, underlying, expiry, strike, optionType,
    lots, qty, filledQty: 0, entryOrderId: r.orderId, limitPrice,
    stopLoss: sl, stopLimit: stopLimitFor(sl, c.tickSize), target: tgt, ocoRef: `O${ref.slice(1)}`,
    status: 'WAITING_FILL', createdAt: new Date().toISOString(),
  }
  brackets.push(b); saveBrackets()
  console.log(`\x1b[36m[Trade:${mode}]\x1b[0m BUY ${qty} ${c.tradingSymbol} @ ≤${limitPrice} (SL ${sl}, target ${tgt}) → ${r.orderId}`)
  await stepBracket(b).catch(e => { b.lastError = e.message })

  const result = { ok: true, mode, orderId: r.orderId, bracketId: b.id, tradingSymbol: c.tradingSymbol, qty, limitPrice, status: b.status }
  if (clientRef) { recentRefs.set(clientRef, result); setTimeout(() => recentRefs.delete(clientRef), 10 * 60_000) }
  return result
}

async function exitPosition(tradingSymbol) {
  const br = broker()
  const c = await getContractBySymbol(tradingSymbol)
  const tick = c?.tickSize || 0.05

  // 1. Cancel protection first — otherwise the OCO's SELL plus ours could sell twice
  const ocos = (await br.getOcos()).filter(o => o.tradingSymbol === tradingSymbol)
  for (const o of ocos) await br.cancelOco(o.id)
  for (const b of brackets) if (b.mode === mode && b.tradingSymbol === tradingSymbol && ACTIVE_BRACKET.has(b.status)) { b.status = 'CLOSED'; b.note = 'Exited manually' }
  saveBrackets()

  // 2. Sell what's held with a marketable limit (≈3% under LTP caps slippage)
  const pos = (await br.getPositions()).find(p => p.tradingSymbol === tradingSymbol)
  if (!pos || pos.qty <= 0) return { ok: true, note: 'No open quantity' }
  const ltp = (await getOptionLtp([tradingSymbol]))[tradingSymbol]
  if (ltp == null) throw new TradeError('No live price — exit manually in the Groww app', 502)
  const price = Math.max(tick, floorTick(ltp * 0.97, tick))
  const r = await br.placeOrder({ tradingSymbol, side: 'SELL', qty: pos.qty, orderType: 'LIMIT', price, ref: newRef('X') })
  console.log(`\x1b[33m[Trade:${mode}]\x1b[0m EXIT SELL ${pos.qty} ${tradingSymbol} @ ≥${price} → ${r.orderId}`)
  return { ok: true, orderId: r.orderId, qty: pos.qty, price }
}

async function exitAll() {
  const br = broker()
  // Cancel unfilled entries for index options, then exit each open long position
  const orders = await br.getOrders()
  for (const o of orders) {
    if (o.side === 'BUY' && (o.status === 'OPEN' || o.status === 'TRIGGER_PENDING') && await getContractBySymbol(o.tradingSymbol)) {
      await br.cancelOrder(o.id).catch(() => {})
    }
  }
  const results = []
  for (const p of await br.getPositions()) {
    if (p.qty > 0 && await getContractBySymbol(p.tradingSymbol)) {
      results.push(await exitPosition(p.tradingSymbol).then(r => ({ tradingSymbol: p.tradingSymbol, ...r }), e => ({ tradingSymbol: p.tradingSymbol, error: e.message })))
    }
  }
  return { ok: results.every(r => !r.error), results }
}

async function authStatus() {
  try { await growwAccessToken(); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
}

async function book() {
  const br = broker()
  const [orders, pnl, funds, ocos] = await Promise.allSettled([br.getOrders(), dayPnl(br), br.getFunds(), br.getOcos()])
  const val = (r) => (r.status === 'fulfilled' ? r.value : null)
  const err = (r) => (r.status === 'rejected' ? r.reason?.message : null)
  const p = val(pnl)
  return {
    mode,
    orders: val(orders) || [],
    positions: (p?.positions || []).map(x => {
      const ltp = p.ltps[x.tradingSymbol] ?? null
      return { ...x, ltp, unrealisedPnl: ltp != null && x.qty !== 0 ? Number(((ltp - x.avgPrice) * x.qty).toFixed(2)) : 0 }
    }),
    pnl: p ? { realised: Math.round(p.realised), unrealised: Math.round(p.unrealised), total: Math.round(p.total) } : null,
    funds: val(funds),
    ocos: val(ocos) || [],
    brackets: brackets.filter(b => b.mode === mode).slice().reverse(),
    errors: { orders: err(orders), positions: err(pnl), funds: err(funds), ocos: err(ocos) },
    limits: { maxLots: cfg.maxLots, maxLossPerTrade: cfg.maxLossPerTrade, dailyLossLimit: cfg.dailyLossLimit },
    ts: Date.now(),
  }
}

// ── HTTP layer ─────────────────────────────────────────────────────────────
// These endpoints move money, so only this app's own pages may call them.
// Local (no APP_PASSWORD):
//  - Host must be localhost (blocks DNS-rebinding)
//  - Origin, when sent, must be localhost (blocks other websites' fetch/form posts)
// Deployed (APP_PASSWORD): api.js requires the login cookie first; Origin, when
// sent, must be in ALLOWED_ORIGINS (if set).
// Always: a custom header is required, which forces a CORS preflight cross-origin,
// and cross-site requests (Sec-Fetch-Site) are refused.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
function allowed(req) {
  const origin = req.headers.origin
  if (cfg.localOnly) {
    if (!LOCAL_HOST.test(req.headers.host || '')) return false
    if (origin) {
      try { if (!LOCAL_HOST.test(new URL(origin).host)) return false } catch { return false }
    }
  } else if (origin && cfg.allowedOrigins.length && !cfg.allowedOrigins.includes(origin.replace(/\/$/, ''))) {
    return false
  }
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return false
  return req.headers['x-trade-client'] === 'nifty-terminal'
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', c => { data += c; if (data.length > 20_000) { reject(new TradeError('Body too large', 413)); req.destroy() } })
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch { reject(new TradeError('Invalid JSON')) } })
    req.on('error', reject)
  })
}

const routes = {
  'GET /status': async () => ({
    mode, liveEnabled: cfg.liveEnabled, marketOpen: marketOpenForEntries(),
    auth: await authStatus(),
    priceSource: priceSource.last, growwDataError: priceSource.growwError,
    limits: { maxLots: cfg.maxLots, maxLossPerTrade: cfg.maxLossPerTrade, dailyLossLimit: cfg.dailyLossLimit, paperCapital: cfg.paperCapital },
  }),

  'POST /mode': async (_q, body) => {
    if (body.mode === 'paper') { mode = 'paper'; console.log('\x1b[33m[Trade]\x1b[0m Mode → PAPER'); return { mode } }
    if (body.mode !== 'live') throw new TradeError('mode must be paper or live')
    if (!cfg.liveEnabled) throw new TradeError('Live trading is disabled. Set TRADING_LIVE_ENABLED=true in .env and restart.', 403)
    if (body.confirm !== 'LIVE') throw new TradeError('Type LIVE to confirm real-money trading')
    await liveBroker.getFunds().catch(e => { throw new TradeError(`Groww account not reachable: ${e.message}`, 502) })
    mode = 'live'
    console.log('\x1b[31m[Trade]\x1b[0m Mode → LIVE (real money)')
    return { mode }
  },

  'GET /expiries': async (q) => ({ expiries: await getExpiries(q.get('underlying')) }),

  // Contract details + live premium. Snaps to the nearest listed strike/expiry.
  'GET /contract': async (q) => {
    const underlying = q.get('underlying'), type = q.get('type')
    const expiries = await getExpiries(underlying)
    if (!expiries.length) throw new TradeError(`No upcoming ${underlying} expiries in Groww's instrument list`, 404)
    const expiry = expiries.includes(q.get('expiry')) ? q.get('expiry') : expiries[0]
    const strikes = await getStrikes(underlying, expiry, type)
    const want = Number(q.get('strike'))
    const strike = strikes.reduce((best, s) => (Math.abs(s - want) < Math.abs(best - want) ? s : best), strikes[0])
    const c = await getContract(underlying, expiry, strike, type)
    let ltp = null, ltpError = null
    try { ltp = (await getOptionLtp([c.tradingSymbol]))[c.tradingSymbol] ?? null } catch (e) { ltpError = e.message }
    return { contract: c, expiries, ltp, ltpError, priceSource: priceSource.last, isExpiryDay: expiry === todayIST() }
  },

  'POST /order':    async (_q, body) => placeEntry(body),
  'POST /cancel':   async (_q, body) => { await broker().cancelOrder(body.orderId); return { ok: true } },
  'POST /exit':     async (_q, body) => exitPosition(body.tradingSymbol),
  'POST /exit-all': async () => exitAll(),
  'POST /protect':  async (_q, body) => {
    const b = brackets.find(x => x.id === body.bracketId && x.mode === mode)
    if (!b) throw new TradeError('Trade not found', 404)
    if (b.status !== 'UNPROTECTED') throw new TradeError(`Trade is ${b.status}, not unprotected`)
    await protect(b)
    return { ok: b.status === 'PROTECTED', status: b.status, error: b.error }
  },
  'POST /cancel-protection': async (_q, body) => {
    await broker().cancelOco(body.ocoId)
    for (const b of brackets) if (b.ocoId === body.ocoId) { b.status = 'CLOSED'; b.note = 'Protection cancelled by you' }
    saveBrackets()
    return { ok: true }
  },
  'POST /paper/reset': async () => {
    if (mode !== 'paper') throw new TradeError('Switch to paper mode first')
    paperBroker.reset()
    brackets = brackets.filter(b => b.mode !== 'paper'); saveBrackets()
    return { ok: true }
  },
  'GET /book': async () => book(),
}

export function tradingMiddleware(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  if (!allowed(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Forbidden' })); return }

  const url = new URL(req.url, 'http://localhost')   // req.url is relative to the /api/trade mount
  const handler = routes[`${req.method} ${url.pathname.replace(/\/$/, '') || '/'}`]
  if (!handler) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' })); return }

  ;(async () => {
    const body = req.method === 'POST' ? await readJson(req) : {}
    return handler(url.searchParams, body)
  })().then(
    out => res.end(JSON.stringify(out)),
    e => {
      res.statusCode = e.status || 502
      res.end(JSON.stringify({ error: e.message }))
    },
  )
}

// Dev server only (configureServer) — a plain `vite build` must not start timers.
// Vite re-imports this module whenever the config or .env changes, in the same
// process. Clear the previous module's timer so two loops never watch (and try to
// protect) the same order.
export function startTrading() {
  if (globalThis.__niftyTradeLoop) clearInterval(globalThis.__niftyTradeLoop)
  globalThis.__niftyTradeLoop = setInterval(loop, 2000)
  ensureInstruments().catch(e => console.warn('\x1b[33m[Groww]\x1b[0m Instruments unavailable:', e.message))
}
