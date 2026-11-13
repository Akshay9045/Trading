// ── Paper broker: simulated fills against LIVE Groww option prices ──────────
// Same interface and shapes as liveBroker.js. Nothing is ever sent to Groww's
// order endpoints — fills are priced from live option prices (see prices.js).
// Fill rules (option buying; no shorting):
//   LIMIT BUY  fills at LTP once LTP ≤ limit      LIMIT SELL fills at LTP once LTP ≥ limit
//   SL SELL    triggers once LTP ≤ trigger and fills at LTP (models gap/slippage)
//   OCO        target LIMIT SELL + SL SELL; when one fills the other is cancelled
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getOptionLtp } from './prices.js'
import { todayIST } from './instruments.js'
import { dataPath } from './paths.js'

const STATE_PATH = dataPath('paper-state.json')

let S = null
let startingCapital = 100000

const freshState = () => ({
  capital: startingCapital, cash: startingCapital, day: todayIST(),
  orders: [], positions: {}, ocos: [],
})

function load() {
  if (S) return S
  try { S = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { S = freshState() }
  rollDay()
  return S
}
function save() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify(S, null, 2))
}
// New trading day: day orders and OCOs expire (like Groww's DAY validity); positions carry.
function rollDay() {
  const d = todayIST()
  if (S.day === d) return
  for (const o of S.orders) if (o.status === 'OPEN' || o.status === 'TRIGGER_PENDING') { o.status = 'CANCELLED'; o.remark = 'Expired at end of day' }
  for (const oco of S.ocos) if (oco.status === 'ACTIVE') oco.status = 'EXPIRED'
  S.orders = S.orders.filter(o => o.time?.slice(0, 10) === d || o.status === 'OPEN')
  for (const p of Object.values(S.positions)) p.realisedPnl = 0
  S.day = d
  save()
}

const id = (p) => `${p}${crypto.randomBytes(5).toString('hex')}`
const nowIso = () => new Date().toISOString()
const isOpen = (o) => o.status === 'OPEN' || o.status === 'TRIGGER_PENDING'

function heldQty(sym) { return S.positions[sym]?.qty || 0 }
function pendingSellQty(sym, exceptOcoId) {
  // Quantity already committed to open sell orders that are NOT legs of the same OCO
  // (an OCO's two legs share one quantity — only one of them can ever fill).
  let q = 0
  const counted = new Set()
  for (const o of S.orders) {
    if (o.tradingSymbol !== sym || o.side !== 'SELL' || !isOpen(o)) continue
    if (o.ocoId) { if (o.ocoId === exceptOcoId || counted.has(o.ocoId)) continue; counted.add(o.ocoId) }
    q += o.qty
  }
  return q
}

function applyFill(o, px) {
  const value = px * o.qty
  const pos = S.positions[o.tradingSymbol] ||= { qty: 0, avgPrice: 0, realisedPnl: 0 }
  if (o.side === 'BUY') {
    pos.avgPrice = (pos.avgPrice * pos.qty + value) / (pos.qty + o.qty)
    pos.qty += o.qty
    S.cash -= value
  } else {
    pos.realisedPnl += (px - pos.avgPrice) * o.qty
    pos.qty -= o.qty
    if (pos.qty === 0) pos.avgPrice = 0
    S.cash += value
  }
  o.status = 'EXECUTED'
  o.filledQty = o.qty
  o.avgPrice = Number(px.toFixed(2))
  o.remark = 'Paper fill at live price'
  o.filledAt = nowIso()
}

function tryFill(o, ltp) {
  if (!isOpen(o) || ltp == null) return false
  let fill = false
  if (o.orderType === 'MARKET') fill = true
  else if (o.orderType === 'LIMIT') fill = o.side === 'BUY' ? ltp <= o.price : ltp >= o.price
  else if (o.orderType === 'SL' || o.orderType === 'SL_M') fill = o.side === 'SELL' ? ltp <= o.triggerPrice : ltp >= o.triggerPrice
  if (!fill) return false

  if (o.side === 'BUY' && ltp * o.qty > S.cash + 1e-6) {
    o.status = 'REJECTED'; o.remark = `Insufficient paper funds (need ₹${Math.round(ltp * o.qty)}, have ₹${Math.round(S.cash)})`
    return true
  }
  if (o.side === 'SELL' && heldQty(o.tradingSymbol) < o.qty) {
    o.status = 'REJECTED'; o.remark = 'Paper: nothing left to sell (position already closed)'
    return true
  }
  applyFill(o, ltp)

  // OCO: one leg filled → cancel its sibling
  if (o.ocoId) {
    const oco = S.ocos.find(x => x.id === o.ocoId)
    if (oco) {
      oco.status = 'COMPLETED'
      oco.filledLeg = o.id === oco.targetOrderId ? 'TARGET' : 'STOP_LOSS'
      for (const sib of S.orders) if (sib.ocoId === o.ocoId && sib.id !== o.id && isOpen(sib)) { sib.status = 'CANCELLED'; sib.remark = 'OCO: other leg filled' }
    }
  }
  return true
}

export const paperBroker = {
  mode: 'paper',

  configure({ capital }) {
    if (Number.isFinite(capital) && capital > 0) startingCapital = capital
  },

  reset() {
    S = freshState()
    save()
  },

  async placeOrder({ tradingSymbol, side, qty, orderType, price, triggerPrice, ref }) {
    load()
    if (side === 'SELL' && heldQty(tradingSymbol) - pendingSellQty(tradingSymbol) < qty) {
      throw new Error('Paper mode does not allow short selling — you can only sell what you hold')
    }
    const o = {
      id: id('P'), ref, tradingSymbol, side, qty, filledQty: 0, avgPrice: null,
      orderType, price: price ?? null, triggerPrice: triggerPrice ?? null,
      status: orderType === 'SL' || orderType === 'SL_M' ? 'TRIGGER_PENDING' : 'OPEN',
      remark: '', time: nowIso(),
    }
    S.orders.push(o)
    // Try an immediate fill at the current price (marketable orders fill now)
    const ltp = (await getOptionLtp([tradingSymbol]))[tradingSymbol]
    if (ltp == null) {
      o.status = 'REJECTED'; o.remark = 'No live price for this contract (Groww and NSE both unavailable)'
    } else {
      tryFill(o, ltp)
    }
    save()
    if (o.status === 'REJECTED') throw new Error(o.remark)
    return { orderId: o.id, status: o.status }
  },

  async cancelOrder(orderId) {
    load()
    const o = S.orders.find(x => x.id === orderId)
    if (!o) throw new Error('Order not found')
    if (!isOpen(o)) throw new Error(`Order is already ${o.status}`)
    if (o.ocoId) throw new Error('This order is a stop-loss/target leg — cancel the protection instead')
    o.status = 'CANCELLED'; o.remark = 'Cancelled by you'
    save()
  },

  async getOrder(orderId) {
    load()
    const o = S.orders.find(x => x.id === orderId)
    if (!o) throw new Error('Order not found')
    return { id: o.id, status: o.status, rawStatus: o.status, filledQty: o.filledQty, remark: o.remark }
  },

  async getOrders() {
    load()
    return [...S.orders].reverse()
  },

  async getPositions() {
    load()
    return Object.entries(S.positions)
      .filter(([, p]) => p.qty !== 0 || p.realisedPnl !== 0)
      .map(([sym, p]) => ({ tradingSymbol: sym, qty: p.qty, avgPrice: Number(p.avgPrice.toFixed(2)), realisedPnl: Number(p.realisedPnl.toFixed(2)), product: 'NRML' }))
  },

  async getFunds() {
    load()
    const used = Object.values(S.positions).reduce((a, p) => a + p.qty * p.avgPrice, 0)
    return { available: Number(S.cash.toFixed(2)), cash: Number(S.cash.toFixed(2)), used: Number(used.toFixed(2)), capital: S.capital, label: 'Paper cash' }
  },

  getLtp: (symbols) => getOptionLtp(symbols),

  async createOco({ tradingSymbol, qty, target, stopLoss, stopLimit, ref }) {
    load()
    const free = heldQty(tradingSymbol) - pendingSellQty(tradingSymbol)
    if (free < qty) throw new Error(`Only ${free} qty is free to protect`)
    const ocoId = id('OCO')
    const t = { id: id('P'), ref: `${ref}T`, tradingSymbol, side: 'SELL', qty, filledQty: 0, avgPrice: null, orderType: 'LIMIT', price: target, triggerPrice: null, status: 'OPEN', remark: 'Target leg', time: nowIso(), ocoId }
    const s = { id: id('P'), ref: `${ref}S`, tradingSymbol, side: 'SELL', qty, filledQty: 0, avgPrice: null, orderType: 'SL', price: stopLimit, triggerPrice: stopLoss, status: 'TRIGGER_PENDING', remark: 'Stop-loss leg', time: nowIso(), ocoId }
    S.orders.push(t, s)
    S.ocos.push({ id: ocoId, tradingSymbol, qty, target, stopLoss, status: 'ACTIVE', targetOrderId: t.id, slOrderId: s.id, createdAt: nowIso() })
    save()
    return { ocoId, status: 'ACTIVE' }
  },

  async cancelOco(ocoId) {
    load()
    const oco = S.ocos.find(x => x.id === ocoId)
    if (!oco) throw new Error('Protection order not found')
    if (oco.status === 'ACTIVE') oco.status = 'CANCELLED'
    for (const o of S.orders) if (o.ocoId === ocoId && isOpen(o)) { o.status = 'CANCELLED'; o.remark = 'Protection cancelled' }
    save()
  },

  async getOcos() {
    load()
    return S.ocos.filter(o => o.status === 'ACTIVE').map(o => ({ id: o.id, tradingSymbol: o.tradingSymbol, qty: o.qty, target: o.target, stopLoss: o.stopLoss, status: o.status }))
  },

  // Called by the engine's loop: re-price every open paper order.
  async tick() {
    load()
    rollDay()
    const open = S.orders.filter(isOpen)
    if (!open.length) return
    const ltps = await getOptionLtp([...new Set(open.map(o => o.tradingSymbol))])
    let changed = false
    for (const o of open) changed = tryFill(o, ltps[o.tradingSymbol]) || changed
    if (changed) save()
  },

  hasOpenWork() {
    load()
    return S.orders.some(isOpen)
  },
}
