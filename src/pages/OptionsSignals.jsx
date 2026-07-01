import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, TrendingDown, RefreshCw, Clock, Info,
  Zap, ChevronRight, AlertCircle, ArrowUp, ArrowDown, Wifi
} from 'lucide-react'
import { useMarketData, useRealtimeQuote, useOptionChain } from '../hooks/useMarketData'
import { buildOptionsSignal, getNextExpiry } from '../services/optionsEngine'
import OptionsSignalCard from '../components/options/OptionsSignalCard'
import RiskPanel from '../components/options/RiskPanel'
import GlassCard from '../components/ui/GlassCard'
import Badge from '../components/ui/Badge'
import { formatPrice } from '../utils/formatters'

const SYMBOLS = ['NIFTY', 'BANKNIFTY']

// ── Animated price digit — flashes on change ─────────────────────────────────
const LivePrice = ({ symbol }) => {
  const { quote, loading, error } = useRealtimeQuote(symbol, 5000)
  const prevPrice = useRef(null)
  const [flash, setFlash] = useState(null)   // 'up' | 'down' | null

  useEffect(() => {
    if (!quote) return
    if (prevPrice.current !== null && quote.price !== prevPrice.current) {
      setFlash(quote.price > prevPrice.current ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 600)
      prevPrice.current = quote.price
      return () => clearTimeout(t)
    }
    prevPrice.current = quote.price
  }, [quote?.price])

  if (loading) return (
    <div className="h-10 w-32 rounded-lg bg-white/[0.06] animate-pulse" />
  )

  if (error || !quote) return (
    <div className="flex items-center gap-2 text-bear text-sm font-mono">
      <AlertCircle size={15} />
      <span>Data unavailable — market may be closed or rate limited</span>
    </div>
  )

  const isPos = quote.changePercent >= 0

  return (
    <div className="flex items-end gap-3">
      {/* Main price */}
      <motion.div
        key={quote.price}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        className={`text-3xl font-black font-mono transition-colors duration-300
          ${flash === 'up' ? 'text-bull' : flash === 'down' ? 'text-bear' : 'text-white'}`}
        style={{
          textShadow: flash === 'up'
            ? '0 0 20px rgba(0,212,161,0.8)'
            : flash === 'down'
            ? '0 0 20px rgba(255,77,109,0.8)'
            : 'none',
        }}
      >
        ₹{formatPrice(quote.price)}
      </motion.div>

      {/* Change */}
      <div className={`mb-1 ${isPos ? 'text-bull' : 'text-bear'}`}>
        <div className="flex items-center gap-1 text-sm font-mono font-bold">
          {isPos ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          {isPos ? '+' : ''}{quote.change?.toFixed(2)}
        </div>
        <div className="text-xs font-mono opacity-80">
          ({isPos ? '+' : ''}{quote.changePercent?.toFixed(2)}%)
        </div>
      </div>
    </div>
  )
}

// ── Live stats strip below the price ─────────────────────────────────────────
const LiveStats = ({ symbol }) => {
  const { quote } = useRealtimeQuote(symbol, 5000)
  if (!quote) return null

  const items = [
    { label: 'Open',       value: formatPrice(quote.open) },
    { label: 'High',       value: formatPrice(quote.high),      color: 'text-bull' },
    { label: 'Low',        value: formatPrice(quote.low),       color: 'text-bear' },
    { label: 'Prev Close', value: formatPrice(quote.prevClose) },
    { label: 'Volume',     value: quote.volume ? (quote.volume / 1e5).toFixed(1) + 'L' : '--' },
  ]

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
      {items.map(item => (
        <div key={item.label} className="text-xs font-mono">
          <span className="text-gray-600">{item.label}: </span>
          <span className={item.color || 'text-gray-300'}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Symbol tab with live price baked in ──────────────────────────────────────
const SymbolTab = ({ symbol, isSelected, onClick }) => {
  const { quote } = useRealtimeQuote(symbol, 5000)
  const { signal }  = useMarketData(symbol, '1D')
  const isPos = (quote?.changePercent ?? 0) >= 0
  const optionType = signal?.type === 'BUY' ? 'CALL' : signal?.type === 'SELL' ? 'PUT' : 'WAIT'

  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-between px-4 py-3 rounded-2xl border transition-all
        ${isSelected
          ? 'border-primary-500/40 bg-primary-500/10'
          : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
        }`}
    >
      <div className="text-left">
        <div className="text-xs text-gray-500 font-mono uppercase tracking-wider">{symbol}</div>
        <div className={`text-xl font-black font-mono mt-0.5 ${isPos ? 'text-white' : 'text-white'}`}>
          {quote ? `₹${formatPrice(quote.price)}` : '…'}
        </div>
        <div className={`text-xs font-mono mt-0.5 flex items-center gap-1
          ${isPos ? 'text-bull' : 'text-bear'}`}>
          {isPos ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          {isPos ? '+' : ''}{quote?.changePercent?.toFixed(2) ?? '--'}%
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Badge
          variant={optionType === 'CALL' ? 'bull' : optionType === 'PUT' ? 'bear' : 'hold'}
          size="sm"
          pulse={optionType !== 'WAIT'}
        >
          {optionType}
        </Badge>
        <div className="flex items-center gap-1 text-[10px] text-gray-600">
          <Wifi size={9} className="text-bull" />
          <span>Live</span>
        </div>
      </div>
    </button>
  )
}

// ── Compact card for secondary symbol ────────────────────────────────────────
const CompactCard = ({ symbol, delay }) => {
  const { quote }  = useRealtimeQuote(symbol, 5000)
  const { signal } = useMarketData(symbol, '1D')
  const chain      = useOptionChain(symbol, quote?.price)
  const opts = buildOptionsSignal(signal, symbol, quote, chain)

  if (!opts) return null

  if (opts.action === 'WAIT') return (
    <GlassCard delay={delay} className="p-4 border-hold/15">
      <div className="flex items-center gap-2 mb-1">
        <Clock size={13} className="text-hold" />
        <span className="font-bold text-hold text-sm">{symbol} — WAIT</span>
      </div>
      <p className="text-xs text-gray-500">No clear directional bias. Stay on sidelines.</p>
    </GlassCard>
  )

  const isCall = opts.optionType === 'CALL'
  const color  = isCall ? 'bull' : 'bear'
  const Icon   = isCall ? TrendingUp : TrendingDown

  return (
    <GlassCard delay={delay} className={`p-4 border-${color}/20 bg-${color}/5`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={14} className={`text-${color}`} />
          <span className={`font-black text-base tracking-wide text-${color}`}>
            {isCall ? 'BUY CALL' : 'BUY PUT'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] text-gray-600">
            <Wifi size={9} className="text-bull" />
            <span className="font-mono">
              {quote ? `₹${formatPrice(quote.price)}` : '…'}
            </span>
          </div>
          <Badge variant={color} size="sm">{symbol}</Badge>
        </div>
      </div>

      {/* Strike boxes */}
      <div className="flex gap-2 mb-3">
        {[
          { label: 'Strike', value: `${opts.atmStrike} ${isCall ? 'CE' : 'PE'}`, highlight: true },
          { label: opts.premiumSource === 'live' ? 'Premium' : 'Premium (est)', value: `${opts.premiumSource === 'live' ? '₹' : '~₹'}${opts.atmPremium}` },
          opts.calibrated
            ? { label: 'Win Rate', value: `${opts.backtestWinRate}%` }
            : { label: 'Strength', value: `${opts.confidence}%` },
        ].map(b => (
          <div key={b.label}
            className={`flex-1 rounded-xl p-2.5 text-center border
              ${b.highlight ? `border-${color}/30 bg-${color}/8` : 'border-white/[0.07] bg-white/[0.03]'}`}>
            <div className="text-[10px] text-gray-600 mb-0.5">{b.label}</div>
            <div className={`text-sm font-black font-mono ${b.highlight ? `text-${color}` : 'text-white'}`}>
              {b.value}
            </div>
          </div>
        ))}
      </div>

      {/* Entry / Target / SL */}
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div>
          <div className="text-gray-600 mb-0.5">Entry</div>
          <div className={`font-mono font-bold text-${color}`}>₹{formatPrice(opts.spotEntry)}</div>
        </div>
        <div>
          <div className="text-gray-600 mb-0.5">Target</div>
          <div className="font-mono font-bold text-bull">₹{formatPrice(opts.spotTarget)}</div>
        </div>
        <div>
          <div className="text-gray-600 mb-0.5">Stop Loss</div>
          <div className="font-mono font-bold text-bear">₹{formatPrice(opts.spotStopLoss)}</div>
        </div>
      </div>

      <div className="flex justify-between mt-3 pt-2 border-t border-white/[0.05] text-[10px] text-gray-600">
        <span>R:R = 1:{opts.rrRatio}</span>
        {opts.calibrated && (
          <span className={opts.expectancy > 0 ? 'text-bull' : 'text-bear'}>
            {opts.expectancy} R/trade
          </span>
        )}
        <span>Expiry: {opts.expiry}</span>
      </div>
    </GlassCard>
  )
}

// ── How to execute guide ──────────────────────────────────────────────────────
const HowToUse = () => (
  <GlassCard delay={0.35} className="p-5">
    <div className="flex items-center gap-2 mb-3">
      <Info size={14} className="text-primary-400" />
      <h3 className="font-semibold text-sm text-gray-200">How to Execute</h3>
    </div>
    <ol className="space-y-2.5 text-xs text-gray-400">
      {[
        'Open Zerodha / Upstox / Angel — go to F&O section',
        'Search NIFTY or BANKNIFTY options chain',
        'Pick the expiry date shown on the card (weekly Thursday)',
        'Buy ATM strike CE (CALL) or PE (PUT) at the shown premium',
        'Place stop loss at the premium SL price immediately after entry',
        'Exit when premium hits target OR spot reaches target level',
        'Never hold to expiry — exit with at least 30 min remaining',
      ].map((step, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="w-5 h-5 rounded-full bg-primary-500/15 text-primary-400 flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">
            {i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
    <div className="mt-4 p-3 rounded-xl bg-bear/8 border border-bear/15 text-[10px] text-gray-500 leading-relaxed">
      ⚠️ Not financial advice. Options can go to zero. Always use stop losses.
    </div>
  </GlassCard>
)

// ── Main page ─────────────────────────────────────────────────────────────────
const OptionsSignals = () => {
  const [selected, setSelected]   = useState('NIFTY')
  const [refreshKey, setRefreshKey]  = useState(0)
  const { signal, loading, refresh } = useMarketData(selected, '1D')
  const { quote: liveQuote }         = useRealtimeQuote(selected, 5000)   // live 5s
  const optionChain                  = useOptionChain(selected, liveQuote?.price, refreshKey)

  // Manual refresh: reload candles AND re-pull the option chain on click
  const handleRefresh = () => { refresh(); setRefreshKey(k => k + 1) }

  // Build options signal using live quote for price, candle signal for direction,
  // and the live option chain for real per-strike premiums + IV (falls back to
  // estimated premiums when the chain is unavailable).
  const optionsSignal = buildOptionsSignal(signal, selected, liveQuote, optionChain)

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Options Signals</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            CALL / PUT with live entry price · target · stop loss
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bull/10 border border-bull/20">
            <span className="w-1.5 h-1.5 bg-bull rounded-full animate-pulse" />
            <span className="text-[11px] font-mono text-bull font-semibold">LIVE · 5s refresh</span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-all text-gray-400 hover:text-white"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </motion.div>

      {/* ── Symbol tabs with live prices ── */}
      <div className="grid grid-cols-2 gap-3">
        {SYMBOLS.map(sym => (
          <SymbolTab
            key={sym}
            symbol={sym}
            isSelected={selected === sym}
            onClick={() => setSelected(sym)}
          />
        ))}
      </div>

      {/* ── Live price hero strip ── */}
      <GlassCard className="px-5 py-4" delay={0.05}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: live price */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">{selected} · Spot Rate</span>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-bull/10 border border-bull/20">
                <span className="w-1.5 h-1.5 bg-bull rounded-full animate-ping" />
                <span className="text-[9px] font-mono text-bull font-bold">LIVE</span>
              </div>
            </div>
            <LivePrice symbol={selected} />
            <LiveStats symbol={selected} />
          </div>

          {/* Right: expiry + signal badge */}
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-[10px] text-gray-600 uppercase tracking-wide">Weekly Expiry</div>
              <div className="text-sm font-mono font-bold text-gray-300">{getNextExpiry()}</div>
            </div>
            {optionsSignal && optionsSignal.action !== 'WAIT' && (
              <Badge
                variant={optionsSignal.optionType === 'CALL' ? 'bull' : 'bear'}
                size="lg"
                pulse
              >
                {optionsSignal.optionType === 'CALL' ? '📈 BUY CALL' : '📉 BUY PUT'}
              </Badge>
            )}
            {optionsSignal?.action === 'WAIT' && (
              <Badge variant="hold" size="lg">⏳ WAIT</Badge>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Signal card */}
        <div className="xl:col-span-2">
          {loading ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] animate-pulse h-[560px]" />
          ) : (
            <OptionsSignalCard optionsSignal={optionsSignal} delay={0.1} />
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">

          {/* At-a-glance summary */}
          {optionsSignal && optionsSignal.action !== 'WAIT' && (
            <GlassCard delay={0.12} className="p-5">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-3">
                Trade Summary
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Live Rate',       value: liveQuote ? `₹${formatPrice(liveQuote.price)}` : '…',    cls: 'text-white font-mono' },
                  { label: 'Action',          value: optionsSignal.action,                                      cls: optionsSignal.optionType === 'CALL' ? 'text-bull' : 'text-bear' },
                  { label: 'Strike',          value: `${optionsSignal.atmStrike} ${optionsSignal.optionType === 'CALL' ? 'CE' : 'PE'}`, cls: 'text-white font-mono' },
                  { label: optionsSignal.premiumSource === 'live' ? 'Buy Premium At (live)' : 'Buy Premium At (est)',
                    value: `${optionsSignal.premiumSource === 'live' ? '₹' : '~₹'}${optionsSignal.atmPremium}`,
                    cls: optionsSignal.optionType === 'CALL' ? 'text-bull' : 'text-bear' },
                  ...(optionsSignal.impliedVol != null
                    ? [{ label: 'Implied Volatility', value: `${optionsSignal.impliedVol}%`, cls: 'text-gray-300 font-mono' }]
                    : []),
                  { label: 'Target Premium',  value: `~₹${optionsSignal.premiumTarget}`,                       cls: 'text-bull' },
                  { label: 'SL Premium',      value: `~₹${optionsSignal.premiumSL}`,                           cls: 'text-bear' },
                  { label: 'Spot Entry',      value: `₹${formatPrice(optionsSignal.spotEntry)}`,               cls: 'text-gray-300 font-mono' },
                  { label: 'Spot Target',     value: `₹${formatPrice(optionsSignal.spotTarget)}`,              cls: 'text-bull font-mono' },
                  { label: 'Spot Stop Loss',  value: `₹${formatPrice(optionsSignal.spotStopLoss)}`,            cls: 'text-bear font-mono' },
                  { label: 'Risk : Reward',   value: `1 : ${optionsSignal.rrRatio}`,                          cls: 'text-primary-400' },
                  ...(optionsSignal.calibrated
                    ? [
                        { label: 'Backtested Win Rate', value: `${optionsSignal.backtestWinRate}% (n=${optionsSignal.backtestSamples})`, cls: optionsSignal.backtestWinRate >= 50 ? 'text-bull' : 'text-bear' },
                        { label: 'Expectancy',          value: `${optionsSignal.expectancy} R/trade`,                                    cls: optionsSignal.expectancy > 0 ? 'text-bull' : 'text-bear' },
                      ]
                    : [
                        { label: 'Signal Strength', value: `${optionsSignal.confidence}% (untested)`, cls: 'text-gray-400' },
                      ]),
                  { label: 'Expiry',          value: optionsSignal.expiry,                                     cls: 'text-gray-400' },
                ].map(item => (
                  <div key={item.label}
                    className="flex items-center justify-between text-xs border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                    <span className="text-gray-500">{item.label}</span>
                    <span className={`font-semibold ${item.cls}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <RiskPanel optionsSignal={optionsSignal} symbol={selected} delay={0.18} />

          <HowToUse />
        </div>
      </div>

      {/* ── All symbols compact ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Quick Summary — All Symbols
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SYMBOLS.map((sym, i) => (
            <CompactCard key={sym} symbol={sym} delay={0.3 + i * 0.05} />
          ))}
        </div>
      </div>

    </div>
  )
}

export default OptionsSignals
