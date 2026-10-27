import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Wallet, Briefcase, ListOrdered, ShieldCheck, ShieldAlert, Plus, LogOut,
  RotateCcw, AlertOctagon, Radio, FlaskConical, Bell, BellOff, XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import GlassCard from '../components/ui/GlassCard'
import { useTrading } from '../context/TradingContext'
import { tradeApi } from '../services/tradeApi'
import { useSignalAlertsSetting } from '../components/trade/SignalWatcher'

const fmt  = (n) => (n == null || !Number.isFinite(Number(n)) ? '--' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }))
const sgn  = (n) => (n > 0 ? '+' : '') + fmt(n)
const pnlCls = (n) => (n > 0 ? 'text-bull' : n < 0 ? 'text-bear' : 'text-gray-300')
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '')

const STATUS_CLS = {
  EXECUTED: 'text-bull', OPEN: 'text-primary-400', TRIGGER_PENDING: 'text-hold',
  CANCELLED: 'text-gray-500', REJECTED: 'text-bear',
}
const BRACKET_LABEL = {
  WAITING_FILL: ['Waiting for entry fill', 'text-primary-400'],
  PROTECTING:   ['Placing stop-loss + target…', 'text-hold'],
  PROTECTED:    ['Protected (SL + target live)', 'text-bull'],
  UNPROTECTED:  ['NOT PROTECTED', 'text-bear'],
  CLOSED:       ['Closed', 'text-gray-500'],
  CANCELLED:    ['Entry cancelled', 'text-gray-500'],
}

const Section = ({ icon: Icon, title, right, children, delay }) => (
  <GlassCard delay={delay} className="p-5">
    <div className="flex items-center gap-2 mb-4">
      <Icon size={15} className="text-primary-400" />
      <h3 className="font-semibold text-sm text-gray-200">{title}</h3>
      <div className="ml-auto">{right}</div>
    </div>
    {children}
  </GlassCard>
)

const Empty = ({ children }) => <div className="text-xs text-gray-500 py-3">{children}</div>

// ── Paper / Live switch ────────────────────────────────────────────────────
const ModePanel = () => {
  const { status, mode, setMode } = useTrading()
  const [typing, setTyping] = useState(null)   // '' while confirming live
  const [busy, setBusy] = useState(false)
  const live = mode === 'live'

  const go = async (m, confirm) => {
    setBusy(true)
    try { await setMode(m, confirm); setTyping(null); toast.success(m === 'live' ? 'LIVE trading on — real orders go to Groww' : 'Paper trading on') }
    catch (e) { toast.error(e.message, { duration: 7000 }) }
    finally { setBusy(false) }
  }

  return (
    <GlassCard className={`p-5 border ${live ? 'border-bear/50 bg-bear/5' : 'border-hold/30'}`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${live ? 'bg-bear/20 border-bear/40' : 'bg-hold/15 border-hold/30'}`}>
          {live ? <Radio size={20} className="text-bear animate-pulse" /> : <FlaskConical size={20} className="text-hold" />}
        </div>
        <div className="min-w-0">
          <div className={`text-lg font-black tracking-wide ${live ? 'text-bear' : 'text-hold'}`}>{live ? 'LIVE TRADING' : 'PAPER TRADING'}</div>
          <div className="text-xs text-gray-500">
            {live ? 'Orders are sent to your Groww account with real money.' : 'Simulated fills at live option prices. Nothing is sent to Groww.'}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {live ? (
            <button disabled={busy} onClick={() => go('paper')}
              className="px-4 py-2 rounded-lg bg-hold/15 border border-hold/30 text-hold text-sm font-semibold hover:bg-hold/25">
              Switch to paper
            </button>
          ) : typing == null ? (
            <button disabled={busy || !status?.liveEnabled} onClick={() => setTyping('')}
              title={status?.liveEnabled ? '' : 'Set TRADING_LIVE_ENABLED=true in .env and restart'}
              className="px-4 py-2 rounded-lg bg-bear/15 border border-bear/40 text-bear text-sm font-semibold hover:bg-bear/25 disabled:opacity-40 disabled:cursor-not-allowed">
              Go live…
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input autoFocus value={typing} onChange={e => setTyping(e.target.value)} placeholder="type LIVE"
                className="w-28 bg-dark-400/80 rounded-lg px-2.5 py-2 text-sm font-mono text-white border border-bear/40 outline-none" />
              <button disabled={busy || typing !== 'LIVE'} onClick={() => go('live', typing)}
                className="px-3 py-2 rounded-lg bg-bear text-white text-sm font-bold disabled:opacity-40">Confirm</button>
              <button onClick={() => setTyping(null)} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <div className="text-gray-500">Groww login</div>
          <div className={status?.auth?.ok ? 'text-bull font-semibold' : 'text-bear font-semibold'}>
            {status ? (status.auth?.ok ? 'Connected' : 'Not connected') : '…'}
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <div className="text-gray-500">Option prices</div>
          <div className="text-gray-200 font-semibold">{status?.priceSource === 'groww' ? 'Groww live' : status?.priceSource === 'nse' ? 'NSE (Groww data not enabled)' : '…'}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <div className="text-gray-500">Market (new entries)</div>
          <div className={status?.marketOpen ? 'text-bull font-semibold' : 'text-gray-400 font-semibold'}>{status ? (status.marketOpen ? 'Open' : 'Closed') : '…'}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <div className="text-gray-500">Limits</div>
          <div className="text-gray-200 font-semibold">
            {status ? `${status.limits.maxLots} lot · ${fmt(status.limits.maxLossPerTrade)}/trade · ${fmt(status.limits.dailyLossLimit)}/day` : '…'}
          </div>
        </div>
      </div>
      {status && !status.auth?.ok && (
        <p className="mt-3 text-[11px] text-bear">Groww: {status.auth?.error}. Approve today's API session in Groww, then this turns green.</p>
      )}
      {status && !status.liveEnabled && (
        <p className="mt-2 text-[11px] text-gray-500">Live trading is switched off in <code>.env</code> (<code>TRADING_LIVE_ENABLED=false</code>). Practise in paper mode first.</p>
      )}
    </GlassCard>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
const Trade = () => {
  const { mode, openTicket } = useTrading()
  const [book, setBook] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)   // id of the row being acted on
  const [alertsOn, setAlertsOn] = useSignalAlertsSetting()

  const load = useCallback(async () => {
    try { setBook(await tradeApi.book()); setErr(null) }
    catch (e) { setErr(e.message) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [load, mode])

  const act = async (key, fn, okMsg) => {
    setBusy(key)
    try { await fn(); if (okMsg) toast.success(okMsg); await load() }
    catch (e) { toast.error(e.message, { duration: 7000 }) }
    finally { setBusy(null) }
  }

  const live = mode === 'live'
  const openPositions = (book?.positions || []).filter(p => p.qty !== 0)
  const closedPositions = (book?.positions || []).filter(p => p.qty === 0)
  const activeBrackets = (book?.brackets || []).filter(b => ['WAITING_FILL', 'PROTECTING', 'PROTECTED', 'UNPROTECTED'].includes(b.status))
  const unprotected = activeBrackets.filter(b => b.status === 'UNPROTECTED')
  const lossHit = book?.pnl && book.limits && book.pnl.total <= -book.limits.dailyLossLimit

  const enableAlerts = async () => {
    if (!alertsOn && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {})
    }
    setAlertsOn(!alertsOn)
  }

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Trade</h1>
          <p className="text-xs text-gray-500 mt-0.5">Groww orders · positions · stop-loss &amp; target protection</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={enableAlerts}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold ${alertsOn ? 'bg-primary-500/15 border-primary-500/30 text-primary-400' : 'border-white/[0.08] text-gray-400 hover:text-white'}`}>
            {alertsOn ? <Bell size={14} /> : <BellOff size={14} />} Buy alerts {alertsOn ? 'on' : 'off'}
          </button>
          <button onClick={() => openTicket({ underlying: 'NIFTY', optionType: 'CE' })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500/15 border border-primary-500/30 text-primary-400 text-xs font-semibold hover:bg-primary-500/25">
            <Plus size={14} /> New order
          </button>
          <button disabled={!openPositions.length || busy === 'all'}
            onClick={() => { if (window.confirm(`Exit ALL open option positions${live ? ' in your LIVE Groww account' : ''}? Unfilled entries are cancelled too.`)) act('all', tradeApi.exitAll, 'Exit orders sent') }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bear/15 border border-bear/40 text-bear text-xs font-semibold hover:bg-bear/25 disabled:opacity-40">
            <LogOut size={14} /> Exit all
          </button>
        </div>
      </motion.div>

      <ModePanel />

      {err && <div className="px-4 py-3 rounded-xl bg-bear/10 border border-bear/40 text-sm text-bear">{err}</div>}

      {unprotected.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-bear/15 border border-bear/50">
          <ShieldAlert size={18} className="text-bear flex-shrink-0 mt-0.5" />
          <div className="text-sm text-bear">
            <div className="font-bold">{unprotected.length} position(s) have NO stop-loss.</div>
            <div className="text-xs mt-0.5">Retry protection below, or exit the position. Reason: {unprotected[0].error}</div>
          </div>
        </div>
      )}
      {lossHit && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-bear/15 border border-bear/50 text-sm text-bear">
          <AlertOctagon size={18} className="flex-shrink-0 mt-0.5" />
          <span><b>Daily loss limit reached.</b> New entries are blocked for today. Walk away — chasing losses is how accounts blow up.</span>
        </div>
      )}

      {/* Funds + P&L */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: book?.funds?.label || 'Available', value: fmt(book?.funds?.available), cls: 'text-white' },
          { label: 'Used in positions', value: fmt(book?.funds?.used), cls: 'text-gray-300' },
          { label: "Today's realised", value: book?.pnl ? sgn(book.pnl.realised) : '--', cls: pnlCls(book?.pnl?.realised) },
          { label: 'Open (unrealised)', value: book?.pnl ? sgn(book.pnl.unrealised) : '--', cls: pnlCls(book?.pnl?.unrealised) },
        ].map((c, i) => (
          <GlassCard key={c.label} delay={0.03 * i} className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider"><Wallet size={11} /> {c.label}</div>
            <div className={`text-lg font-mono font-bold mt-1 ${c.cls}`}>{c.value}</div>
          </GlassCard>
        ))}
      </div>
      {book?.errors && Object.values(book.errors).some(Boolean) && (
        <p className="text-[11px] text-hold">Some data could not load: {Object.entries(book.errors).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Positions */}
        <Section icon={Briefcase} title="Positions" delay={0.05}>
          {!openPositions.length && !closedPositions.length ? <Empty>No positions today.</Empty> : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500 text-left">
                  <th className="px-1 py-1.5 font-medium">Contract</th><th className="px-1 font-medium text-right">Qty</th>
                  <th className="px-1 font-medium text-right">Avg</th><th className="px-1 font-medium text-right">LTP</th>
                  <th className="px-1 font-medium text-right">P&amp;L</th><th />
                </tr></thead>
                <tbody>
                  {[...openPositions, ...closedPositions].map(p => {
                    const total = (p.realisedPnl || 0) + (p.unrealisedPnl || 0)
                    return (
                      <tr key={p.tradingSymbol} className="border-t border-white/[0.05]">
                        <td className="px-1 py-2 font-mono text-gray-200">{p.tradingSymbol}</td>
                        <td className="px-1 text-right font-mono">{p.qty}</td>
                        <td className="px-1 text-right font-mono text-gray-400">{p.qty ? p.avgPrice.toFixed(2) : '--'}</td>
                        <td className="px-1 text-right font-mono text-gray-300">{p.ltp != null ? p.ltp.toFixed(2) : '--'}</td>
                        <td className={`px-1 text-right font-mono font-bold ${pnlCls(total)}`}>{sgn(Math.round(total))}</td>
                        <td className="px-1 text-right">
                          {p.qty > 0 && (
                            <button disabled={busy === p.tradingSymbol}
                              onClick={() => { if (window.confirm(`Exit ${p.qty} ${p.tradingSymbol}${live ? ' (LIVE)' : ''}? Its stop-loss/target is cancelled first.`)) act(p.tradingSymbol, () => tradeApi.exit(p.tradingSymbol), 'Exit order sent') }}
                              className="px-2.5 py-1 rounded-md bg-bear/15 border border-bear/40 text-bear font-semibold hover:bg-bear/25 disabled:opacity-40">
                              Exit
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Protection (brackets) */}
        <Section icon={ShieldCheck} title="Stop-loss & target" delay={0.08}>
          {!(book?.brackets || []).length ? <Empty>Trades placed from this app show their protection here.</Empty> : (
            <div className="space-y-2">
              {book.brackets.slice(0, 12).map(b => {
                const [label, cls] = BRACKET_LABEL[b.status] || [b.status, 'text-gray-400']
                return (
                  <div key={b.id} className={`rounded-xl border px-3 py-2.5 ${b.status === 'UNPROTECTED' ? 'border-bear/50 bg-bear/10' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-200">{b.tradingSymbol}</span>
                      <span className="text-[10px] text-gray-500">{b.qty} qty · {time(b.createdAt)}</span>
                      <span className={`ml-auto text-[11px] font-semibold ${cls}`}>{label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] font-mono">
                      <span className="text-gray-400">Entry ≤{b.limitPrice}</span>
                      <span className="text-bear">SL {b.stopLoss}</span>
                      <span className="text-bull">Target {b.target}</span>
                      {b.status === 'UNPROTECTED' && (
                        <button disabled={busy === b.id} onClick={() => act(b.id, () => tradeApi.retryProtection(b.id), 'Protection placed')}
                          className="ml-auto px-2 py-0.5 rounded bg-bear text-white font-sans font-semibold disabled:opacity-40">Retry</button>
                      )}
                      {b.status === 'PROTECTED' && b.ocoId && (
                        <button disabled={busy === b.id}
                          onClick={() => { if (window.confirm('Remove the stop-loss and target? The position stays open with no protection.')) act(b.id, () => tradeApi.cancelProtection(b.ocoId), 'Protection removed') }}
                          className="ml-auto text-gray-500 hover:text-bear font-sans" title="Remove protection"><XCircle size={13} /></button>
                      )}
                    </div>
                    {(b.note || b.error) && <div className={`text-[10px] mt-1 ${b.error ? 'text-bear' : 'text-gray-500'}`}>{b.error || b.note}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Order book */}
      <Section icon={ListOrdered} title="Order book (today)" delay={0.1}
        right={!live && (
          <button onClick={() => { if (window.confirm('Reset the paper account? All paper orders and positions are wiped.')) act('reset', tradeApi.resetPaper, 'Paper account reset') }}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-white"><RotateCcw size={12} /> Reset paper account</button>
        )}>
        {!(book?.orders || []).length ? <Empty>No orders yet today.</Empty> : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 text-left">
                <th className="px-1 py-1.5 font-medium">Time</th><th className="px-1 font-medium">Contract</th>
                <th className="px-1 font-medium">Side</th><th className="px-1 font-medium">Type</th>
                <th className="px-1 font-medium text-right">Qty</th><th className="px-1 font-medium text-right">Price</th>
                <th className="px-1 font-medium">Status</th><th />
              </tr></thead>
              <tbody>
                {book.orders.slice(0, 50).map(o => (
                  <tr key={o.id} className="border-t border-white/[0.05] align-top">
                    <td className="px-1 py-2 font-mono text-gray-500">{time(o.time)}</td>
                    <td className="px-1 py-2 font-mono text-gray-200">{o.tradingSymbol}</td>
                    <td className={`px-1 py-2 font-semibold ${o.side === 'BUY' ? 'text-bull' : 'text-bear'}`}>{o.side}</td>
                    <td className="px-1 py-2 text-gray-400">{o.orderType}{o.triggerPrice ? ` @${o.triggerPrice}` : ''}</td>
                    <td className="px-1 py-2 text-right font-mono">{o.filledQty ? `${o.filledQty}/` : ''}{o.qty}</td>
                    <td className="px-1 py-2 text-right font-mono text-gray-300">{o.avgPrice ?? o.price ?? '--'}</td>
                    <td className="px-1 py-2">
                      <div className={`font-semibold ${STATUS_CLS[o.status] || 'text-gray-400'}`}>{o.status}</div>
                      {o.remark && <div className="text-[10px] text-gray-500 max-w-[220px]">{o.remark}</div>}
                    </td>
                    <td className="px-1 py-2 text-right">
                      {(o.status === 'OPEN' || o.status === 'TRIGGER_PENDING') && !o.ocoId && (
                        <button disabled={busy === o.id} onClick={() => act(o.id, () => tradeApi.cancelOrder(o.id), 'Cancel sent')}
                          className="px-2 py-0.5 rounded-md border border-white/[0.12] text-gray-300 hover:text-white disabled:opacity-40">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

export default Trade
