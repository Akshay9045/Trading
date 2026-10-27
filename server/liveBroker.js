// ── Live broker: real orders on Groww (NSE F&O) ────────────────────────────
// Every method maps 1:1 to a documented Groww endpoint and returns the same
// normalized shapes as paperBroker.js, so the trading engine never branches on mode.
//   Orders:      POST /v1/order/create · POST /v1/order/cancel · GET /v1/order/list · GET /v1/order/status/{id}
//   OCO (exits): POST /v1/order-advance/create · POST /v1/order-advance/cancel/... · GET /v1/order-advance/list
//   Account:     GET /v1/positions/user · GET /v1/margins/detail/user · GET /v1/live-data/ltp
import { growwCall } from './groww.js'

const SEGMENT = 'FNO'
// NRML: Groww's OCO for F&O only supports NRML, and the entry must match its product.
const PRODUCT = 'NRML'

const OPEN_STATES = new Set(['NEW', 'ACKED', 'TRIGGER_PENDING', 'APPROVED', 'MODIFICATION_REQUESTED', 'CANCELLATION_REQUESTED'])
const normStatus = (s) => {
  s = String(s || '').toUpperCase()
  if (s === 'EXECUTED' || s === 'COMPLETED' || s === 'DELIVERY_AWAITED') return 'EXECUTED'
  if (s === 'CANCELLED') return 'CANCELLED'
  if (s === 'REJECTED' || s === 'FAILED') return 'REJECTED'
  if (s === 'TRIGGER_PENDING') return 'TRIGGER_PENDING'
  if (OPEN_STATES.has(s)) return 'OPEN'
  return s || 'UNKNOWN'
}

const num = (v) => (v == null || v === '' ? null : Number(v))
const priceStr = (n) => Number(n).toFixed(2)

const normOrder = (o) => ({
  id:           o.groww_order_id,
  ref:          o.order_reference_id,
  tradingSymbol:o.trading_symbol,
  side:         o.transaction_type,
  qty:          num(o.quantity),
  filledQty:    num(o.filled_quantity) || 0,
  avgPrice:     num(o.average_fill_price),
  orderType:    o.order_type,
  price:        num(o.price),
  triggerPrice: num(o.trigger_price),
  status:       normStatus(o.order_status),
  rawStatus:    o.order_status,
  remark:       o.remark || '',
  time:         o.created_at || o.exchange_time || null,
})

export const liveBroker = {
  mode: 'live',

  async placeOrder({ tradingSymbol, side, qty, orderType, price, triggerPrice, ref }) {
    const body = {
      trading_symbol: tradingSymbol,
      quantity: qty,
      validity: 'DAY',
      exchange: 'NSE',
      segment: SEGMENT,
      product: PRODUCT,
      order_type: orderType,          // LIMIT | MARKET | SL | SL_M
      transaction_type: side,         // BUY | SELL
      order_reference_id: ref,
    }
    if (orderType === 'LIMIT' || orderType === 'SL') body.price = Number(priceStr(price))
    if (orderType === 'SL' || orderType === 'SL_M') body.trigger_price = Number(priceStr(triggerPrice))
    const p = await growwCall('POST', '/v1/order/create', body)
    const status = normStatus(p.order_status)
    if (status === 'REJECTED') throw new Error(p.remark || 'Groww rejected the order')
    if (!p.groww_order_id) throw new Error('Groww returned no order ID — check the order book before retrying')
    return { orderId: p.groww_order_id, status }
  },

  async cancelOrder(orderId) {
    await growwCall('POST', '/v1/order/cancel', { segment: SEGMENT, groww_order_id: orderId })
  },

  async getOrder(orderId) {
    const p = await growwCall('GET', `/v1/order/status/${encodeURIComponent(orderId)}?segment=${SEGMENT}`)
    return {
      id: p.groww_order_id || orderId,
      status: normStatus(p.order_status),
      rawStatus: p.order_status,
      filledQty: num(p.filled_quantity) || 0,
      remark: p.remark || '',
    }
  },

  async getOrders() {
    const all = []
    for (let page = 0; page < 10; page++) {
      const p = await growwCall('GET', `/v1/order/list?segment=${SEGMENT}&page=${page}&page_size=100`)
      const batch = p.order_list || []
      all.push(...batch.map(normOrder))
      if (batch.length < 100) break
    }
    return all
  },

  async getPositions() {
    const p = await growwCall('GET', `/v1/positions/user?segment=${SEGMENT}`)
    return (p.positions || []).map(x => ({
      tradingSymbol: x.trading_symbol,
      qty:           num(x.quantity) || 0,
      avgPrice:      num(x.net_price) || 0,
      realisedPnl:   num(x.realised_pnl) || 0,
      product:       x.product,
    }))
  },

  async getFunds() {
    const p = await growwCall('GET', '/v1/margins/detail/user')
    const fno = p.fno_margin_details || {}
    return {
      available:  num(fno.option_buy_balance_available) ?? num(p.clear_cash),
      cash:       num(p.clear_cash),
      used:       num(p.net_margin_used),
      label:      'Option buy balance',
    }
  },

  // Live prices for up to 50 F&O symbols: { tradingSymbol: ltp }
  async getLtp(symbols) {
    const out = {}
    for (let i = 0; i < symbols.length; i += 50) {
      const chunk = symbols.slice(i, i + 50)
      const qs = chunk.map(s => `NSE_${s}`).join(',')
      const p = await growwCall('GET', `/v1/live-data/ltp?segment=${SEGMENT}&exchange_symbols=${encodeURIComponent(qs)}`)
      for (const s of chunk) if (p?.[`NSE_${s}`] != null) out[s] = Number(p[`NSE_${s}`])
    }
    return out
  },

  // Stop-loss + target as ONE Groww OCO: when one leg fills Groww cancels the other,
  // server-side — it keeps protecting the position even if this app is closed.
  async createOco({ tradingSymbol, qty, netQty, target, stopLoss, stopLimit, ref }) {
    const p = await growwCall('POST', '/v1/order-advance/create', {
      reference_id: ref,
      smart_order_type: 'OCO',
      segment: SEGMENT,
      trading_symbol: tradingSymbol,
      quantity: qty,
      net_position_quantity: netQty,
      transaction_type: 'SELL',
      target:    { trigger_price: priceStr(target),   order_type: 'LIMIT', price: priceStr(target) },
      // SL (stop-limit), not SL_M: exchanges/brokers commonly block SL-M on options.
      stop_loss: { trigger_price: priceStr(stopLoss), order_type: 'SL',    price: priceStr(stopLimit) },
      product_type: PRODUCT,
      exchange: 'NSE',
      duration: 'DAY',
    })
    return { ocoId: p.smart_order_id, status: p.status }
  },

  async cancelOco(ocoId) {
    await growwCall('POST', `/v1/order-advance/cancel/${SEGMENT}/OCO/${encodeURIComponent(ocoId)}`)
  },

  async getOcos() {
    const p = await growwCall('GET', `/v1/order-advance/list?segment=${SEGMENT}&smart_order_type=OCO&status=ACTIVE&page=0&page_size=50`)
    return (p.orders || []).map(o => ({
      id:            o.smart_order_id,
      tradingSymbol: o.trading_symbol,
      qty:           num(o.quantity),
      target:        num(o.target?.price ?? o.target?.trigger_price),
      stopLoss:      num(o.stop_loss?.trigger_price),
      status:        o.status,
    }))
  },
}
