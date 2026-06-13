import { useState, useEffect, useMemo } from 'react'
import { Shield, AlertOctagon, Plus, X } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import {
  getLotSize, sizePosition, loadSettings, saveSettings,
  loadTodayLog, saveTodayLog, dayPnL, lossLimitHit,
} from '../../utils/riskManager'

const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN')

// Position sizing + daily-loss guard. Sits on the Options page.
const RiskPanel = ({ optionsSignal, symbol, delay = 0 }) => {
  const [settings, setSettings] = useState(loadSettings)
  const [log, setLog]           = useState(loadTodayLog)
  const [amt, setAmt]           = useState('')

  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { saveTodayLog(log) }, [log])

  const update = (k, v) => setSettings(s => ({ ...s, [k]: v === '' ? '' : Number(v) }))

  const actionable = optionsSignal && optionsSignal.action !== 'WAIT'
  const lotSize    = getLotSize(symbol)

  const sizing = useMemo(() => actionable
    ? sizePosition({
        capital: settings.capital, riskPct: settings.riskPct,
        entryPremium: optionsSignal.atmPremium, slPremium: optionsSignal.premiumSL, lotSize,
      })
    : null,
    [actionable, settings.capital, settings.riskPct, optionsSignal?.atmPremium, optionsSignal?.premiumSL, lotSize])

  const pnl     = dayPnL(log)
  const stopped = lossLimitHit(log, settings.dailyLossLimit)

  const addEntry = () => {
    const v = Number(amt)
    if (!v) return
    setLog(l => [...l, { amount: v, ts: Date.now() }])
    setAmt('')
  }

  const inputCls = 'w-full bg-dark-400/80 rounded-lg px-2.5 py-1.5 text-sm font-mono text-white border border-white/[0.08] focus:border-primary-500/40 outline-none'

  return (
    <GlassCard delay={delay} className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={14} className="text-primary-400" />
        <h3 className="font-semibold text-sm text-gray-200">Risk Manager</h3>
      </div>

      {/* STOP banner */}
      {stopped && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bear/20 border border-bear/50 mb-4">
          <AlertOctagon size={15} className="text-bear flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-bear leading-snug">
            <span className="font-bold">STOP TRADING TODAY.</span> You've hit your daily loss limit
            ({fmt(settings.dailyLossLimit)}). Walk away — chasing losses is how accounts blow up. Reset tomorrow.
          </p>
        </div>
      )}

      {/* Settings */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { k: 'capital',        label: 'Capital (₹)' },
          { k: 'riskPct',        label: 'Risk / trade %' },
          { k: 'dailyLossLimit', label: 'Daily loss cap (₹)' },
        ].map(f => (
          <div key={f.k}>
            <div className="text-[10px] text-gray-600 mb-1">{f.label}</div>
            <input type="number" className={inputCls}
              value={settings[f.k]} onChange={e => update(f.k, e.target.value)} />
          </div>
        ))}
      </div>

      {/* Position sizing for the current signal */}
      {actionable && sizing ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 mb-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
            Suggested Size · {symbol} {optionsSignal.atmStrike} {optionsSignal.optionType === 'CALL' ? 'CE' : 'PE'} (lot {lotSize})
          </div>
          {sizing.affordable ? (
            <div className="space-y-1.5">
              {[
                { label: `Buy ${sizing.lots} lot${sizing.lots > 1 ? 's' : ''}`, value: `${sizing.lots * lotSize} qty`, cls: 'text-bull font-bold' },
                { label: 'Capital deployed',  value: fmt(sizing.capitalDeployed), cls: 'text-white' },
                { label: 'At risk (to SL)',   value: fmt(sizing.totalRisk),       cls: 'text-bear' },
                { label: 'Max loss (→ ₹0)',   value: fmt(sizing.maxLossIfZero),   cls: 'text-bear' },
                { label: 'Risk budget',       value: fmt(sizing.riskBudget),      cls: 'text-gray-400' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{r.label}</span>
                  <span className={`font-mono font-semibold ${r.cls}`}>{r.value}</span>
                </div>
              ))}
              {sizing.deploysOverHalf && (
                <p className="text-[10px] text-hold mt-1.5">⚠️ This deploys over 50% of capital into one trade — consider fewer lots.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-bear">
              Can't afford even 1 lot within your {settings.riskPct}% risk budget ({fmt(sizing.riskBudget)}).
              The per-lot risk is {fmt(sizing.perLotRisk)}. Increase capital, widen risk %, or skip this trade.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 mb-4 text-xs text-gray-500">
          No actionable trade right now — sizing appears when there's a BUY CALL / BUY PUT.
        </div>
      )}

      {/* Daily P&L tracker */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">Today's P&amp;L (log each exit)</span>
          <span className={`text-sm font-mono font-bold ${pnl >= 0 ? 'text-bull' : 'text-bear'}`}>
            {pnl >= 0 ? '+' : ''}{fmt(pnl)}
          </span>
        </div>

        <div className="flex gap-2 mb-2">
          <input
            type="number"
            placeholder="+ profit / - loss (₹)"
            className={inputCls}
            value={amt}
            onChange={e => setAmt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEntry()}
            disabled={stopped}
          />
          <button onClick={addEntry} disabled={stopped}
            className="flex items-center gap-1 px-3 rounded-lg bg-primary-500/15 border border-primary-500/30 text-primary-400 text-xs font-semibold hover:bg-primary-500/25 transition-all disabled:opacity-40">
            <Plus size={13} /> Log
          </button>
        </div>

        {log.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {log.map((e, i) => (
              <div key={e.ts || i} className="flex items-center justify-between text-xs bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                <span className={`font-mono font-semibold ${e.amount >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {e.amount >= 0 ? '+' : ''}{fmt(e.amount)}
                </span>
                <button onClick={() => setLog(l => l.filter((_, idx) => idx !== i))}
                  className="text-gray-600 hover:text-bear transition-colors">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">
        Sizing assumes you exit at the premium stop-loss. Worst case (option → ₹0) is shown separately.
        Lot sizes change periodically — verify against the current NSE circular.
      </p>
    </GlassCard>
  )
}

export default RiskPanel
