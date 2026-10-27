import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useTrading } from '../../context/TradingContext'
import { tradeApi } from '../../services/tradeApi'

const fmt = (n) => (n == null || !Number.isFinite(n) ? '--' : '₹' + Math.round(n).toLocaleString('en-IN'))
const STRIKE_STEP = { NIFTY: 50, BANKNIFTY: 100 }
const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const fmtExpiry = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

const inputCls = 'w-full bg-dark-400/80 rounded-lg px-2.5 py-2 text-sm font-mono text-white border border-white/[0.08] focus:border-primary-500/40 outline-none'

// The one place an order is created. Everything shown here is re-checked on the
// server (lots cap, loss at stop, daily loss limit, SL < entry < target).
const OrderTicket = () => {
  const { ticket, closeTicket, status, mode } = useTrading()
  const navigate = useNavigate()
  const live = mode === 'live'

  const [underlying, setUnderlying] = useState('NIFTY')
  const [optionType, setOptionType] = useState('CE')
  const [strike, setStrike]         = useState('')
  const [expiry, setExpiry]         = useState('')
  const [lots, setLots]             = useState(1)
  const [priceMode, setPriceMode]   = useState('LIMIT')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopLoss, setStopLoss]     = useState('')
  const [target, setTarget]         = useState('')
  const [info, setInfo]             = useState(null)   // /contract response
  const [loadErr, setLoadErr]       = useState(null)
  const [ack, setAck]               = useState(false)  // live-money acknowledgement
  const [submitting, setSubmitting] = useState(false)
  const pricedFor = useRef(null)                       // contract the SL/target defaults were set for
  const clientRef = useMemo(() => (ticket ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null), [ticket])

  // Reset from the prefill each time the ticket opens
  useEffect(() => {
    if (!ticket) return
    setUnderlying(ticket.underlying || 'NIFTY')
    setOptionType(ticket.optionType || 'CE')
    setStrike(ticket.strike ? String(ticket.strike) : '')
    setExpiry('')
    setLots(Math.max(1, Math.min(ticket.suggestedLots || 1, status?.limits?.maxLots || 1)))
    setPriceMode('LIMIT')
    setInfo(null); setLoadErr(null); setAck(false)
    pricedFor.current = null
  }, [ticket])   // eslint-disable-line react-hooks/exhaustive-deps

  // Load contract + live premium, refresh every 3s while open
  useEffect(() => {
    if (!ticket || !strike) return
    let active = true
    const load = async () => {
      try {
        const r = await tradeApi.contract({ underlying, type: optionType, strike, expiry: expiry || undefined })
        if (!active) return
        setInfo(r); setLoadErr(null)
        if (!expiry) {
          // Default to the nearest expiry that isn't today — expiry-day options can go to ₹0 within hours
          const next = r.expiries.find(e => e !== todayIST()) || r.expiries[0]
          if (next !== r.contract.expiry) { setExpiry(next); return }
          setExpiry(r.contract.expiry)
        }
        // First live price for this contract → seed limit / SL / target from the signal's distances
        const key = r.contract.tradingSymbol
        if (r.ltp != null && pricedFor.current !== key) {
          pricedFor.current = key
          // Manual ticket: 20% stop, tightened so the loss at stop fits the per-trade limit
          const maxGap = (status?.limits?.maxLossPerTrade || Infinity) / ((Number(lots) || 1) * r.contract.lotSize) * 0.95
          const slGap  = ticket.slOffset     ?? Math.max(r.contract.tickSize, Math.min(r.ltp * 0.2, maxGap))
          const tgtGap = ticket.targetOffset ?? Math.max(1, r.ltp * 0.3)
          setLimitPrice(r.ltp.toFixed(2))
          setStopLoss(Math.max(0.05, r.ltp - slGap).toFixed(2))
          setTarget((r.ltp + tgtGap).toFixed(2))
        }
      } catch (e) {
        if (active) setLoadErr(e.message)
      }
    }
    load()
    const id = setInterval(load, 3000)
    return () => { active = false; clearInterval(id) }
  }, [ticket, underlying, optionType, strike, expiry])

  if (!ticket) return null

  const c        = info?.contract
  const ltp      = info?.ltp ?? null
  const qty      = c ? lots * c.lotSize : 0
  const entryRef = priceMode === 'MARKET' ? ltp : Number(limitPrice)
  const sl       = Number(stopLoss), tgt = Number(target)
  const lossAtSL = entryRef && sl ? (entryRef - sl) * qty : null
  const gainAtT  = entryRef && tgt ? (tgt - entryRef) * qty : null
  const cost     = entryRef ? entryRef * qty : null
  const limits   = status?.limits || {}

  const problems = []
  if (!c) problems.push('Loading contract…')
  if (c && ltp == null) problems.push('No live price for this contract')
  if (!(lots >= 1) || !Number.isInteger(Number(lots))) problems.push('Lots must be a whole number ≥ 1')
  if (limits.maxLots && lots > limits.maxLots) problems.push(`Max ${limits.maxLots} lot(s) per order`)
  if (priceMode === 'LIMIT' && !(Number(limitPrice) > 0)) problems.push('Enter a limit price')
  if (!(sl > 0 && tgt > 0)) problems.push('Stop-loss and target are required')
  else if (entryRef && !(sl < entryRef && entryRef < tgt)) problems.push('Need stop-loss < entry < target')
  if (lossAtSL != null && limits.maxLossPerTrade && lossAtSL > limits.maxLossPerTrade) problems.push(`Loss at stop ${fmt(lossAtSL)} is over your ${fmt(limits.maxLossPerTrade)} limit — use fewer lots or a tighter stop`)
  if (live && !status?.marketOpen) problems.push('Market is closed for new entries (09:15–15:20 IST)')
  if (live && !ack) problems.push('Tick the real-money box')

  const submit = async () => {
    setSubmitting(true)
    try {
      const r = await tradeApi.placeOrder({
        underlying, expiry: c.expiry, strike: c.strike, optionType, lots: Number(lots), priceMode,
        limitPrice: priceMode === 'LIMIT' ? Number(limitPrice) : undefined,
        stopLoss: sl, target: tgt, clientRef,
      })
      toast.success(`${r.mode === 'live' ? 'LIVE' : 'Paper'} order placed: BUY ${r.qty} ${r.tradingSymbol}`, { duration: 5000 })
      closeTicket()
      navigate('/trade')
    } catch (e) {
      toast.error(e.message, { duration: 7000 })
    } finally {
      setSubmitting(false)
    }
  }

  const isCall = optionType === 'CE'
  const accent = isCall ? 'text-bull' : 'text-bear'

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 overflow-y-auto"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeTicket}>
        <motion.div onClick={e => e.stopPropagation()}
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className={`w-full max-w-lg rounded-2xl border bg-dark-200 shadow-2xl ${live ? 'border-bear/50' : 'border-white/[0.1]'}`}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div>
              <div className="text-xs text-gray-500">Buy option</div>
              <div className={`text-lg font-bold font-mono ${accent}`}>
                {c ? c.tradingSymbol : `${underlying} ${strike} ${optionType}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${live ? 'bg-bear/20 text-bear border-bear/40' : 'bg-hold/15 text-hold border-hold/30'}`}>
                {live ? 'LIVE · REAL MONEY' : 'PAPER'}
              </span>
              <button onClick={closeTicket} className="p-1.5 text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Contract */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Underlying</div>
                <select className={inputCls} value={underlying}
                  onChange={e => { setUnderlying(e.target.value); setExpiry(''); setStrike('') }}>
                  <option>NIFTY</option><option>BANKNIFTY</option>
                </select>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Type</div>
                <div className="grid grid-cols-2 gap-1">
                  {['CE', 'PE'].map(t => (
                    <button key={t} onClick={() => setOptionType(t)}
                      className={`py-2 rounded-lg text-sm font-bold border ${optionType === t
                        ? (t === 'CE' ? 'bg-bull/15 text-bull border-bull/40' : 'bg-bear/15 text-bear border-bear/40')
                        : 'border-white/[0.08] text-gray-500'}`}>
                      {t === 'CE' ? 'CALL' : 'PUT'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Strike</div>
                <input type="number" step={STRIKE_STEP[underlying]} className={inputCls} value={strike}
                  placeholder={underlying === 'NIFTY' ? 'e.g. 22800' : 'e.g. 51000'}
                  onChange={e => setStrike(e.target.value)} />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Expiry</div>
                <select className={inputCls} value={expiry} onChange={e => setExpiry(e.target.value)}>
                  {(info?.expiries || []).slice(0, 8).map(e => (
                    <option key={e} value={e}>{fmtExpiry(e)}{e === todayIST() ? ' (today)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live price */}
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
              <div>
                <div className="text-[10px] text-gray-500">Live premium</div>
                <div className={`text-2xl font-mono font-bold ${accent}`}>{ltp != null ? `₹${ltp.toFixed(2)}` : '…'}</div>
              </div>
              <div className="text-right text-[11px] text-gray-500 font-mono leading-5">
                {c && <div>Lot size {c.lotSize} · tick ₹{c.tickSize}</div>}
                {info?.priceSource && <div>Price from {info.priceSource === 'groww' ? 'Groww' : 'NSE (few sec delay)'}</div>}
              </div>
            </div>
            {loadErr && <p className="text-xs text-bear">{loadErr}</p>}

            {/* Order */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Lots {limits.maxLots ? `(max ${limits.maxLots})` : ''}</div>
                <input type="number" min={1} step={1} className={inputCls} value={lots}
                  onChange={e => setLots(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Order type</div>
                <select className={inputCls} value={priceMode} onChange={e => setPriceMode(e.target.value)}>
                  <option value="LIMIT">Limit</option>
                  <option value="MARKET">Market (≤3% slip)</option>
                </select>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Limit price</div>
                <input type="number" step="0.05" className={inputCls} disabled={priceMode === 'MARKET'}
                  value={priceMode === 'MARKET' ? '' : limitPrice} placeholder={priceMode === 'MARKET' ? 'at market' : ''}
                  onChange={e => setLimitPrice(e.target.value)} />
              </div>
              <div>
                <div className="text-[10px] text-bear mb-1">Stop-loss (premium)</div>
                <input type="number" step="0.05" className={inputCls} value={stopLoss} onChange={e => setStopLoss(e.target.value)} />
              </div>
              <div>
                <div className="text-[10px] text-bull mb-1">Target (premium)</div>
                <input type="number" step="0.05" className={inputCls} value={target} onChange={e => setTarget(e.target.value)} />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Quantity</div>
                <div className="px-2.5 py-2 text-sm font-mono text-white">{qty || '--'}</div>
              </div>
            </div>

            {/* Money */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white/[0.03] py-2">
                <div className="text-[10px] text-gray-500">Cost</div>
                <div className="text-sm font-mono font-bold text-white">{fmt(cost)}</div>
              </div>
              <div className="rounded-lg bg-bear/10 py-2">
                <div className="text-[10px] text-gray-500">Loss at stop</div>
                <div className="text-sm font-mono font-bold text-bear">-{fmt(lossAtSL)}</div>
              </div>
              <div className="rounded-lg bg-bull/10 py-2">
                <div className="text-[10px] text-gray-500">Profit at target</div>
                <div className="text-sm font-mono font-bold text-bull">+{fmt(gainAtT)}</div>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-gray-400 leading-snug">
              <ShieldCheck size={14} className="text-primary-400 flex-shrink-0 mt-0.5" />
              <span>Once the buy fills, a stop-loss + target order (OCO) is placed {live ? 'at Groww' : 'in the paper account'} automatically — when one fills, the other is cancelled.{live ? ' It is valid for today only; the position carries overnight (NRML) without protection unless you exit.' : ''}</span>
            </div>

            {info?.isExpiryDay && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-hold/10 border border-hold/30 text-[11px] text-hold">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                This contract expires today. Its premium can drop to ₹0 within hours.
              </div>
            )}

            {live && (
              <label className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bear/10 border border-bear/40 text-[12px] text-bear cursor-pointer">
                <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5" />
                I understand this sends a real order to Groww using real money, and I can lose the full {fmt(cost)}.
              </label>
            )}

            {problems.length > 0 && c && (
              <ul className="text-[11px] text-hold space-y-0.5">
                {problems.map(p => <li key={p}>• {p}</li>)}
              </ul>
            )}

            <button onClick={submit} disabled={problems.length > 0 || submitting}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2
                ${live ? 'bg-bear text-white hover:bg-bear/90' : isCall ? 'bg-bull text-dark-400 hover:bg-bull/90' : 'bg-bear text-white hover:bg-bear/90'}`}>
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {live ? 'Place LIVE order' : 'Place paper order'} · BUY {qty || ''} {c?.tradingSymbol || ''}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default OrderTicket
