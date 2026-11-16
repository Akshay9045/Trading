import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Cpu, Zap, RefreshCw, AlertCircle, CheckCircle,
  TrendingUp, TrendingDown, Minus, Key, ExternalLink, Loader, Clock
} from 'lucide-react'
import { useMarketData, useRealtimeQuote, useOptionChain, useDailyTrend, useExpiries, calibrateSignal } from '../hooks/useMarketData'
import { getClaudeAnalysis, isAIEnabled, getActiveProvider, loadAIStatus, PROVIDER_INFO } from '../services/claudeService'
import { generateSignal } from '../services/signalEngine'
import { getATMStrike, getOTMStrike, getITMStrike, getNextExpiryISO } from '../services/optionsEngine'
import { planTrade } from '../services/tradePlan'
import { logAICall, scoreAICalls, getAIRecord } from '../services/aiTrackRecord'
import GlassCard from '../components/ui/GlassCard'
import Badge from '../components/ui/Badge'
import { formatPrice } from '../utils/formatters'

const SYMBOLS = ['NIFTY', 'BANKNIFTY']

// Always-trade grading: never hide the direction — show BUY CALL / BUY PUT with a
// quality % and a one-word verdict so the user can judge. Prefers the real backtested
// win rate; falls back to the formula strength (labeled untested). Weak / counter-trend
// / negative-edge setups still show, just clearly flagged to avoid.
const gradeTrade = (signal) => {
  if (!signal) return null
  const dir = signal.type === 'SELL'
    ? 'PUT'
    : signal.type === 'BUY'
      ? 'CALL'
      : (signal.bullScore ?? 0) >= (signal.bearScore ?? 0) ? 'CALL' : 'PUT'

  const winRate = signal.calibrated ? (signal.bucketWinRate ?? signal.backtestWinRate) : null
  const quality = Math.round(winRate != null ? winRate : (signal.confidence ?? 50))

  // With target and stop no longer 1:1, a lower win rate can still pay. Grade on the
  // backtested R per trade (after costs) when there is one.
  let label, tone
  if (signal.calibrated && signal.expectancy != null && signal.expectancy <= 0) { label = 'AVOID · negative edge'; tone = 'bear' }
  else if (signal.trendAligned === false) { label = 'RISKY · counter-trend'; tone = 'bear' }
  else if (signal.calibrated && signal.expectancy >= 0.2) { label = 'STRONG'; tone = 'bull' }
  else if (signal.calibrated) { label = 'MODERATE'; tone = 'hold' }
  else if (quality >= 65) { label = 'UNTESTED'; tone = 'hold' }
  else { label = 'WEAK · avoid'; tone = 'bear' }

  return { dir, quality, label, tone, winRate, basis: winRate != null ? 'backtested' : 'untested' }
}

// ── No-key setup card ─────────────────────────────────────────────────────────
const SetupCard = () => (
  <GlassCard className="p-6 border-hold/20" delay={0}>
    <div className="flex items-start gap-3 mb-5">
      <div className="w-10 h-10 rounded-xl bg-hold/15 border border-hold/25 flex items-center justify-center flex-shrink-0">
        <Key size={20} className="text-hold" />
      </div>
      <div>
        <h3 className="font-bold text-white text-base">Add a Free AI Key</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          App uses whichever key you add — Gemini checked first
        </p>
      </div>
    </div>

    {/* Option cards */}
    <div className="space-y-3 mb-5">
      {[
        {
          name: 'Google Gemini Flash',
          tag: '⭐ RECOMMENDED — 100% FREE',
          tagColor: 'bg-bull/15 text-bull border-bull/25',
          limit: '1,500 calls/day · 15/min',
          url: 'https://aistudio.google.com',
          urlLabel: 'aistudio.google.com → Get API Key',
          envKey: 'GEMINI_API_KEY',
          example: 'AIzaSyXXXXXXXXXXXXXXXX',
          color: 'border-blue-500/20 bg-blue-500/5',
        },
        {
          name: 'Groq (GPT-OSS 120B)',
          tag: 'FREE',
          tagColor: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
          limit: '6,000 calls/day · 30/min',
          url: 'https://console.groq.com',
          urlLabel: 'console.groq.com → API Keys → Create',
          envKey: 'GROQ_API_KEY',
          example: 'gsk_XXXXXXXXXXXXXXXX',
          color: 'border-orange-500/20 bg-orange-500/5',
        },
        {
          name: 'Anthropic Claude Haiku',
          tag: 'PAID ($5 min)',
          tagColor: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
          limit: '~16,000 calls per $5',
          url: 'https://console.anthropic.com',
          urlLabel: 'console.anthropic.com → API Keys',
          envKey: 'ANTHROPIC_API_KEY',
          example: 'sk-ant-api03-XXXXXX',
          color: 'border-white/10 bg-white/[0.02]',
        },
      ].map(opt => (
        <div key={opt.name} className={`rounded-xl border p-4 ${opt.color}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm text-white">{opt.name}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${opt.tagColor}`}>
              {opt.tag}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 mb-2">{opt.limit}</div>
          <div className="flex items-center justify-between">
            <a href={opt.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary-400 hover:underline flex items-center gap-1">
              <ExternalLink size={10} />{opt.urlLabel}
            </a>
          </div>
          <div className="mt-2 bg-dark-400/80 rounded-lg px-3 py-2 font-mono text-[11px] border border-white/[0.05]">
            <span className="text-gray-600">{opt.envKey}=</span>
            <span className="text-bull">{opt.example}</span>
          </div>
        </div>
      ))}
    </div>

    <div className="bg-dark-300/80 rounded-xl p-4 font-mono text-xs border border-white/[0.06] mb-4">
      <div className="text-gray-600 mb-2"># Local: add to the project's .env · Deployed: add as a Railway variable</div>
      <div className="text-gray-400">GROQ_API_KEY=<span className="text-bull">your-key-here</span></div>
    </div>

    <div className="flex items-center gap-2 text-xs text-hold">
      <AlertCircle size={12} />
      After adding the key, restart the server (<code className="text-primary-400 bg-white/[0.06] px-1.5 py-0.5 rounded">npm run dev</code> locally; Railway redeploys by itself). Keys stay on the server, never in the website.
    </div>
  </GlassCard>
)

// ── Status bar for an in-progress call ───────────────────────────────────────
const ThinkingBar = ({ symbol }) => (
  <motion.div
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-500/10 border border-primary-500/20"
  >
    <Loader size={15} className="text-primary-400 animate-spin" />
    <span className="text-sm text-primary-400 font-medium">
      AI is analyzing {symbol} indicators…
    </span>
    <div className="ml-auto flex gap-1">
      {[0, 0.2, 0.4].map(d => (
        <motion.div
          key={d}
          className="w-1.5 h-1.5 bg-primary-400 rounded-full"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: d }}
        />
      ))}
    </div>
  </motion.div>
)

// ── Error message card ────────────────────────────────────────────────────────
const ErrorCard = ({ error }) => (
  <GlassCard className="p-4 border-bear/20 bg-bear/5">
    <div className="flex items-center gap-2">
      <AlertCircle size={15} className="text-bear flex-shrink-0" />
      <p className="text-sm text-bear">{error}</p>
    </div>
  </GlassCard>
)

// ── Main Claude result card ───────────────────────────────────────────────────
// The trade is the ENGINE's side, at levels sized to the time left before expiry
// (services/tradePlan). The headline number is the backtested win rate of exactly
// those levels; the AI is a second opinion that must agree before a trade shows.
const ClaudeResultCard = ({ result, symbol, livePrice, signal, chain, plan, record, delay = 0 }) => {
  const { next: weeklyExpiry, monthly: monthlyExpiry } = useExpiries(symbol)   // real dates from Groww
  if (!result || result.error) return null

  const aiName     = PROVIDER_INFO[result.provider]?.name || 'AI'
  const grade      = gradeTrade(signal)
  const engDir     = grade ? grade.dir : null
  const aiDir      = result.optionType === 'PUT' ? 'PUT' : 'CALL'
  const cardDir    = engDir || aiDir
  const agrees     = engDir === aiDir
  const isCallSide = cardDir === 'CALL'
  const color      = isCallSide ? 'bull' : 'bear'
  const Icon       = isCallSide ? TrendingUp : TrendingDown
  const sideSuffix = isCallSide ? 'CE' : 'PE'

  // Live market premium (LTP) for a strike, correct leg for the card's side
  const legPremium = (strike) => {
    const leg = chain?.strikes?.get?.(strike)
    if (!leg) return null
    const ltp = isCallSide ? leg.callLtp : leg.putLtp
    return ltp != null && ltp > 0 ? ltp : null
  }

  const entryPx    = livePrice || signal?.entry || 0
  const tgtDist    = plan?.targetPts ?? (signal ? Math.abs(signal.target - signal.entry) : 0)
  const slDist     = plan?.stopPts   ?? (signal ? Math.abs(signal.entry - signal.stopLoss) : 0)
  const dispEntry  = entryPx
  const dispTarget = isCallSide ? entryPx + tgtDist : entryPx - tgtDist
  const dispStop   = isCallSide ? entryPx - slDist  : entryPx + slDist

  // Ideal pullback-entry zone: EMA9/EMA20 act as support (CALL) or resistance (PUT).
  const e9  = signal?.indicators?.ema9
  const e20 = signal?.indicators?.ema20
  const hasZone = e9 != null && e20 != null
  const zoneLo  = hasZone ? Math.min(e9, e20) : null
  const zoneHi  = hasZone ? Math.max(e9, e20) : null
  const atmStrike  = entryPx ? getATMStrike(entryPx, symbol) : null
  const itmStrike  = entryPx ? getITMStrike(entryPx, symbol, cardDir) : null
  const otmStrike  = entryPx ? getOTMStrike(entryPx, symbol, cardDir) : null
  const optLive    = plan?.premium != null && legPremium(atmStrike) != null && !chain?._stale

  // The AI's own index target as a premium: same delta, same time decay as the plan
  const aiTgtPts    = result.targetZone > 0 ? (isCallSide ? result.targetZone - entryPx : entryPx - result.targetZone) : 0
  const aiOptTarget = optLive && agrees && aiTgtPts > 0
    ? Math.round((plan.premium + plan.delta * Math.min(aiTgtPts, plan.reachableMove) - plan.decay) * 20) / 20
    : null
  const aiIndexTgt  = result.targetZone > 0 ? `index ₹${Math.round(result.targetZone).toLocaleString('en-IN')}` : null

  // Every reason this is NOT a trade right now. Any one blocks the Buy levels.
  const blocks = []
  if (!signal) blocks.push('No chart data for the engine')
  else if (!signal.calibrated) blocks.push('Not enough history to test these levels')
  if (grade && grade.tone === 'bear') blocks.push(grade.label.includes('negative')
    ? `Backtest of these levels loses money (${signal.expectancy} R/trade)`
    : grade.label.includes('counter') ? 'Against the Daily trend' : 'Weak setup')
  if (engDir && !agrees) blocks.push(`AI disagrees: it picks ${aiDir}`)
  if (plan && !plan.ok) blocks.push(...plan.reasons)
  const isTrade = blocks.length === 0

  const tested = signal?.calibrated ? signal.backtestWinRate : null

  return (
    <GlassCard
      delay={delay}
      className={`border-${color}/25 bg-gradient-to-br from-${color}/8 to-${color}/2`}
    >
      {/* ⚠️ Risk disclaimer */}
      <div className="px-5 pt-4">
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bear/15 border border-bear/40">
          <AlertCircle size={14} className="text-bear flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-bear leading-snug">
            <span className="font-bold">Research / paper-trading only — NOT financial advice.</span> Backtests describe
            the past; no level here is guaranteed. Do not trade real money on them.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="p-5 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border bg-${color}/15 border-${color}/30`}>
              <Icon size={22} className={`text-${color}`} />
            </div>
            <div>
              <div className={`text-2xl font-black tracking-widest ${isTrade ? `text-${color}` : 'text-gray-500'}`}>
                {isTrade ? `BUY ${cardDir}` : 'NO TRADE'}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-500 font-mono">{symbol}</span>
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border
                  ${agrees ? 'bg-bull/10 border-bull/25' : 'bg-bear/10 border-bear/25'}`}>
                  <Brain size={9} className={agrees ? 'text-bull' : 'text-bear'} />
                  <span className={`text-[9px] font-mono font-bold ${agrees ? 'text-bull' : 'text-bear'}`}>
                    {aiName}: {agrees ? 'agrees' : `disagrees (${aiDir})`}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] text-gray-600 uppercase tracking-wide">Tested win rate</div>
            <div className={`text-3xl font-black font-mono ${tested == null ? 'text-gray-500' : tested >= 50 ? 'text-bull' : 'text-hold'}`}>
              {tested != null ? `${tested}%` : '—'}
            </div>
            <div className="text-[9px] text-gray-600 font-mono">
              {signal?.calibrated
                ? <>{signal.expectancy} R/trade · n={signal.backtestSamples}</>
                : 'untested'}
            </div>
          </div>
        </div>

        {/* Expiry dates */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Clock size={11} className="text-gray-500 flex-shrink-0" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Expiry:</span>
          <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border
            bg-${color}/15 border-${color}/30 text-${color}`}>
            {symbol === 'BANKNIFTY' ? 'Next' : 'Weekly'} · {weeklyExpiry}
          </span>
          <span className="text-[10px] text-gray-600 font-mono">Monthly · {monthlyExpiry}</span>
          {plan?.minsLeft != null && (
            <span className="text-[10px] text-gray-500 font-mono">· {(plan.minsLeft / 375).toFixed(1)} trading days left</span>
          )}
        </div>

        {/* AI track record — measured, not the model's own confidence */}
        <div className="mt-3 text-[10px] font-mono text-gray-500">
          AI record on {symbol}:{' '}
          {record?.scored
            ? <><span className={record.aiRate >= 50 ? 'text-bull' : 'text-bear'}>{record.aiRight}/{record.scored} right ({record.aiRate}%)</span>
                {record.engineRate != null && <> · engine {record.engineRight}/{record.scored} ({record.engineRate}%)</>}</>
            : 'no scored calls yet'}
          {record?.pending ? <span className="text-gray-600"> · {record.pending} waiting for the result</span> : null}
          <span className="text-gray-700"> · AI says {result.confidence}% (its own guess, not shown as the score)</span>
        </div>
      </div>

      {/* Price levels — from the trade plan (ATR, capped by the move possible before expiry) */}
      <div className="p-5 border-b border-white/[0.06]">
        {atmStrike ? (
          <div className={`mb-4 rounded-xl border p-3
            ${!isTrade ? 'bg-white/[0.03] border-white/10' : isCallSide ? 'bg-bull/10 border-bull/30' : 'bg-bear/10 border-bear/30'}`}>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              {isTrade ? 'Buy This Option' : 'Option (not a trade now)'}
              {grade && <span className={`font-bold text-${grade.tone}`}>· {grade.label}</span>}
            </div>
            <div className={`text-lg font-black font-mono ${!isTrade ? 'text-gray-400' : isCallSide ? 'text-bull' : 'text-bear'}`}>
              {symbol} {atmStrike} {sideSuffix}
              {optLive && (
                <span className="text-sm text-white"> @ ₹{plan.premium.toFixed(2)} <span className="text-[10px] text-bull">(live)</span></span>
              )}
            </div>
            {!optLive && (
              <div className="text-[10px] text-gray-500 mt-1">Waiting for the live option price… it updates by itself within 10 seconds.</div>
            )}

            {!isTrade && (
              <div className="mt-2 rounded-lg bg-bear/8 border border-bear/20 px-3 py-2">
                <div className="text-[11px] font-bold text-bear mb-1">No trade — Buy / Target / Stop are hidden because:</div>
                <ul className="text-[11px] text-gray-400 list-disc ml-4 space-y-0.5">
                  {blocks.map(b => <li key={b}>{b}</li>)}
                </ul>
              </div>
            )}

            {isTrade && optLive && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  {[
                    { label: 'Buy',       value: plan.premium,       cls: 'text-white' },
                    { label: 'Target',    value: plan.premiumTarget, cls: 'text-bull',
                      note: `${Math.round(plan.targetPts)} pts${plan.decay ? ` · −₹${plan.decay.toFixed(2)} decay` : ''}` },
                    { label: 'Stop Loss', value: plan.premiumSL,     cls: 'text-bear', note: `${Math.round(plan.stopPts)} pts` },
                    { label: 'AI Target', value: aiOptTarget,        cls: 'text-primary-300',
                      note: aiOptTarget == null ? 'AI gave no target on this side' : `${aiIndexTgt} · capped to realistic` },
                  ].map(l => (
                    <div key={l.label} className="rounded-xl py-2.5 text-center bg-white/[0.05] border border-white/10">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">{l.label}</div>
                      <div className={`text-xl font-black font-mono ${l.cls}`}>{l.value != null ? `₹${l.value.toFixed(2)}` : '—'}</div>
                      {l.note && <div className="text-[9px] text-gray-600 mt-0.5">{l.note}</div>}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                  Target is capped at {Math.round(plan.reachableMove)} pts — the move NIFTY reaches about half the time in the next {plan.holdBars} candle{plan.holdBars > 1 ? 's' : ''} (IV {(plan.iv * 100).toFixed(1)}%). Exit by then if neither level is hit.
                </div>
              </>
            )}

            {/* 3 strikes */}
            <div className="flex gap-2 mt-2">
              {[
                { label: 'ITM', strike: itmStrike },
                { label: 'ATM ✓', strike: atmStrike, active: true },
                { label: 'OTM', strike: otmStrike },
              ].map(s => (
                <div key={s.label} className={`flex-1 rounded-lg py-2 text-center border text-xs font-mono
                  ${s.active && isTrade
                    ? (isCallSide ? 'bg-bull/15 border-bull/40 text-bull font-bold' : 'bg-bear/15 border-bear/40 text-bear font-bold')
                    : 'bg-white/[0.04] border-white/10 text-gray-400'}`}>
                  <div className="text-[9px] text-gray-600 mb-0.5">{s.label}</div>
                  {s.strike} {sideSuffix}
                  {legPremium(s.strike) != null && (
                    <div className="text-[10px] text-gray-300 mt-0.5">₹{legPremium(s.strike).toFixed(2)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
          Index levels · {cardDir} <span className="text-gray-700">· {isTrade ? 'the tested levels' : 'for reference only'}</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Entry (≈ live)', value: dispEntry,  cls: 'text-white' },
            { label: 'Target',         value: dispTarget, cls: isTrade ? 'text-bull' : 'text-gray-500' },
            { label: 'Stop Loss',      value: dispStop,   cls: isTrade ? 'text-bear' : 'text-gray-500' },
          ].map(item => (
            <div key={item.label}
              className="bg-white/[0.04] rounded-xl p-3 text-center border border-white/[0.05]">
              <div className="text-[10px] text-gray-600 mb-1">{item.label}</div>
              <div className={`text-base font-black font-mono ${item.cls}`}>
                ₹{item.value ? formatPrice(item.value) : '--'}
              </div>
            </div>
          ))}
        </div>

        {/* Live price vs the price when the signal formed (last candle close) */}
        {livePrice && signal?.entry && (
          <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04] text-xs font-mono">
            <span className="text-gray-600">Live Rate</span>
            <span className="text-white font-bold">₹{formatPrice(livePrice)}</span>
            <span className="text-gray-400">signal formed at ₹{formatPrice(signal.entry)}</span>
          </div>
        )}

        {/* Ideal pullback-entry zone (EMA9/EMA20) — shown below the live entry */}
        {hasZone && (
          <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-primary-500/8 border border-primary-500/20 text-[11px] leading-snug">
            <span className="text-gray-500 flex-shrink-0 font-semibold">Ideal entry</span>
            <div className="text-gray-400">
              <span className="font-mono font-bold text-primary-300">₹{formatPrice(zoneLo)} – ₹{formatPrice(zoneHi)}</span>
              {' '}on a pullback to EMA9/EMA20 ({isCallSide ? 'support' : 'resistance'}) — a better fill if price dips.
              Or enter now at <span className="font-mono text-white">₹{formatPrice(dispEntry)}</span> if you don't want to wait.
              <span className="text-gray-600"> Zone may not be reached in a strong trend.</span>
            </div>
          </div>
        )}

      </div>

      {/* Claude's reasoning */}
      <div className="p-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={13} className="text-primary-400" />
          <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">
            {aiName} Reasoning
          </span>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">{result.reasoning}</p>

        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bear/8 border border-bear/15">
          <AlertCircle size={12} className="text-bear flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-400"><span className="text-bear font-semibold">Key Risk: </span>{result.keyRisk}</p>
        </div>
      </div>

      {/* Indicator breakdown */}
      <div className="p-5 border-b border-white/[0.06]">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-3">
          Indicator Reading (by {aiName})
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'RSI',     value: result.indicators?.rsiStatus },
            { label: 'MACD',    value: result.indicators?.macdStatus },
            { label: 'EMA',     value: result.indicators?.emaStatus },
            { label: 'BB',      value: result.indicators?.bbStatus },
          ].map(item => {
            const isBull = item.value?.toLowerCase().includes('bullish') || item.value?.toLowerCase().includes('oversold')
            const isBear = item.value?.toLowerCase().includes('bearish') || item.value?.toLowerCase().includes('overbought')
            return (
              <div key={item.label}
                className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.04]">
                <span className="text-[10px] text-gray-600">{item.label}</span>
                <span className={`text-[11px] font-semibold
                  ${isBull ? 'text-bull' : isBear ? 'text-bear' : 'text-hold'}`}>
                  {item.value || '--'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Formula agreement */}
      <div className="px-5 py-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-gray-500">
          <Zap size={11} />
          Formula + AI agreement:
        </div>
        <Badge
          variant={agrees ? 'bull' : 'hold'}
          size="sm"
        >
          {agrees ? '✓ Both Agree' : '⚡ AI Disagrees — no trade'}
        </Badge>
      </div>
    </GlassCard>
  )
}

// ── Engine (math, backtested) vs AI (LLM opinion) — side by side ──────────────
const EngineVsAI = ({ signal, aiResult, record }) => {
  // Always-trade: show the graded directional pick (Strong / Moderate / Weak / Avoid)
  const g = gradeTrade(signal)
  const eng = (signal && g)
    ? { action: g.dir === 'CALL' ? 'BUY CALL' : 'BUY PUT', conf: g.quality, color: g.tone, tag: g.label }
    : { action: 'NO DATA', conf: null, color: 'gray-500', tag: 'no candles' }

  // Bad grades (AVOID / RISKY / WEAK = bear tone) render MUTED gray, not alarming red —
  // a low-quality trade shouldn't look like a strong directional signal.
  const displayColor = eng.color === 'bear' ? 'gray-500' : eng.color

  const ai = aiResult && !aiResult.error
    ? {
        action: aiResult.optionType === 'PUT' ? 'BUY PUT' : 'BUY CALL',
        conf: aiResult.confidence,
      }
    : null

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Engine — the trustworthy, backtested one */}
      <div className={`rounded-xl border border-${displayColor}/40 bg-${displayColor}/10 p-4`}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-bold text-bull uppercase tracking-wider">✓ Engine</span>
          <span className="text-[9px] text-gray-500">backtested · trust this</span>
        </div>
        {eng.color === 'bear' && eng.action !== 'NO DATA' && (
          <div className="text-[11px] font-bold text-bear uppercase tracking-wider mb-0.5">⚠ Skip this</div>
        )}
        <div className={`text-2xl font-black text-${displayColor}`}>{eng.action}</div>
        <div className="text-xs text-gray-400 mt-1">
          {eng.conf != null ? <span className="font-bold">{eng.conf}%</span> : '—'}
          <span className="text-gray-600"> · {eng.tag}</span>
        </div>
        {/* Real backtested numbers — the honest metric, not the formula confidence */}
        {signal?.calibrated ? (
          <div className="mt-1.5 text-[10px] font-mono">
            <span className={signal.backtestWinRate >= 50 ? 'text-bull' : 'text-bear'}>
              {signal.backtestWinRate}% win
            </span>
            <span className="text-gray-600"> · </span>
            <span className={signal.expectancy > 0 ? 'text-bull' : 'text-bear'}>
              {signal.expectancy} R/trade
            </span>
            <span className="text-gray-600"> (n={signal.backtestSamples}, backtested)</span>
          </div>
        ) : signal ? (
          <div className="mt-1.5 text-[10px] text-gray-600 font-mono">not enough history to backtest yet</div>
        ) : null}
      </div>

      {/* AI — opinion only, unvalidated */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">AI vote</span>
          <span className="text-[9px] text-gray-500">must agree for a trade</span>
        </div>
        <div className="text-2xl font-black text-gray-400">{ai ? ai.action : '—'}</div>
        <div className="text-xs text-gray-500 mt-1">
          {record?.scored
            ? <><span className={`font-bold ${record.aiRate >= 50 ? 'text-bull' : 'text-bear'}`}>{record.aiRate}% right</span> <span className="text-gray-600">· {record.scored} scored calls</span></>
            : <span className="text-gray-600">{ai ? 'no scored calls yet' : 'not run yet'}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Single symbol analysis block ─────────────────────────────────────────────
const SymbolAnalysis = ({ symbol, autoRun }) => {
  // Intraday by default — matches same-day weekly-option trading. '1D' = swing view.
  const [timeframe, setTimeframe] = useState('15m')
  const { signal: strictSignal, candles, quote: marketQuote, loading: dataLoading, error: dataError, refresh } = useMarketData(symbol, timeframe)
  const dailyTrend = useDailyTrend(symbol)   // higher-timeframe trend for intraday alignment

  // Intraday candles only come from Groww/Yahoo. When both refuse, drop to Daily (NSE
  // has that for free) and say so, rather than leaving the page with no analysis.
  const [intradayMissing, setIntradayMissing] = useState(false)
  useEffect(() => {
    if (timeframe !== '1D' && !dataLoading && !candles?.length) {
      setIntradayMissing(true)
      setTimeframe('1D')
    }
  }, [timeframe, dataLoading, candles])

  const { quote: liveQuote }  = useRealtimeQuote(symbol, 5000)
  const quote                 = liveQuote || marketQuote
  const chain                 = useOptionChain(symbol, quote?.price, 0, 10_000)   // live option premiums

  // 1) The engine's side and ATR, on the default 1 ATR levels.
  //    On intraday timeframes it follows the Daily trend; the Daily view has none above it.
  const baseOpts = useMemo(() => ({
    alwaysSignal: true, adxMin: 0, trendFilter: false, targetATR: 1, stopATR: 1,
    higherTrend: timeframe === '1D' ? null : dailyTrend,
  }), [timeframe, dailyTrend])
  const baseSignal = useMemo(
    () => (candles?.length ? generateSignal(candles, baseOpts) : null),
    [candles, baseOpts])

  // 2) Realistic levels for the ATM option on that side: target capped by the move
  //    possible before expiry, stop capped by the premium, time decay included.
  const engSide   = baseSignal?.type === 'SELL' ? 'PUT' : baseSignal?.type === 'BUY' ? 'CALL' : null
  const spot      = quote?.price || baseSignal?.entry
  const atm       = spot ? getATMStrike(spot, symbol) : null
  const leg       = atm ? chain?.strikes?.get?.(atm) : null
  const premium   = leg && engSide ? (engSide === 'CALL' ? leg.callLtp : leg.putLtp) : null
  const legDelta  = leg && engSide ? (engSide === 'CALL' ? leg.callDelta : leg.putDelta) : null
  const expiryISO = chain?.expiry || getNextExpiryISO(symbol)
  const plan = useMemo(() => (baseSignal && engSide ? planTrade({
    spot, atr: baseSignal.indicators?.atr || Math.abs(baseSignal.target - baseSignal.entry), premium, delta: legDelta, strike: atm, side: engSide,
    iv: chain?.atmIV ?? quote?.vix, expiryISO, timeframe,
  }) : null), [baseSignal, engSide, spot, premium, legDelta, atm, chain?.atmIV, quote?.vix, expiryISO, timeframe])

  // 3) Backtest exactly those levels over the same hold window. Multiples are rounded
  //    so the 10-second price refresh doesn't re-run the backtest on every tick.
  const round05 = (v) => Math.max(0.05, Math.round(v * 20) / 20)
  const tgtMult = plan ? round05(plan.targetATR) : 1
  const slMult  = plan ? round05(plan.stopATR) : 1
  const horizon = plan?.holdBars ?? 10
  const signal = useMemo(() => {
    if (!candles?.length) return strictSignal
    const opts = { ...baseOpts, targetATR: tgtMult, stopATR: slMult }
    return calibrateSignal(generateSignal(candles, opts), candles, opts, { horizon })
  }, [candles, strictSignal, baseOpts, tgtMult, slMult, horizon])

  // AI track record: score past calls against the candles that came after them
  const [record, setRecord] = useState(() => getAIRecord(symbol))
  useEffect(() => {
    scoreAICalls(symbol, timeframe, candles)
    setRecord(getAIRecord(symbol))
  }, [symbol, timeframe, candles])
  const [aiResult, setAiResult]  = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [errorMsg, setErrorMsg]  = useState(null)
  const [callCount, setCallCount] = useState(0)

  const TF_OPTIONS = [
    { id: '5m',  label: 'Intraday 5m'  },
    { id: '15m', label: 'Intraday 15m' },
    { id: '1D',  label: 'Swing (Daily)' },
  ]

  const runAnalysis = useCallback(async () => {
    if (dataLoading) return
    if (!signal && !quote) {
      setErrorMsg('Market data not available. Check your internet connection or try again.')
      return
    }
    setAiLoading(true)
    setErrorMsg(null)
    const indicators = signal?.indicators || {}
    const result = await getClaudeAnalysis(symbol, indicators, signal, quote, timeframe, plan)
    if (result.error) {
      setErrorMsg(result.message)
    } else {
      setAiResult(result)
      setCallCount(c => c + 1)
      // Save the call so it can be scored once the next candles arrive
      if (plan && candles?.length) {
        logAICall({
          symbol, timeframe, aiSide: result.optionType === 'PUT' ? 'PUT' : 'CALL', engineSide: engSide,
          entry: quote?.price || signal?.entry, targetPts: plan.targetPts, stopPts: plan.stopPts,
          holdBars: plan.holdBars, candleTime: candles[candles.length - 1].time,
        })
        setRecord(getAIRecord(symbol))
      }
    }
    setAiLoading(false)
  }, [symbol, signal, quote, dataLoading, timeframe, plan, candles, engSide])

  // Auto-run once when data is ready
  useEffect(() => {
    if (autoRun && !dataLoading && (signal || quote) && !aiResult && !aiLoading) {
      runAnalysis()
    }
  }, [autoRun, signal, quote, dataLoading])   // eslint-disable-line

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{symbol}</span>
          {quote && (
            <span className="text-sm font-mono text-gray-400">
              ₹{formatPrice(quote.price)}
              <span className={`ml-1 text-xs ${quote.changePercent >= 0 ? 'text-bull' : 'text-bear'}`}>
                {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent?.toFixed(2)}%
              </span>
            </span>
          )}
          {callCount > 0 && (
            <span className="text-[10px] text-gray-600 font-mono">{callCount} call{callCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Timeframe toggle — intraday vs swing */}
          <div className="flex items-center rounded-lg bg-white/[0.04] border border-white/10 p-0.5">
            {TF_OPTIONS.map(t => (
              <button
                key={t.id}
                onClick={() => { setTimeframe(t.id); setAiResult(null) }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all
                  ${timeframe === t.id ? 'bg-primary-500/25 text-primary-300' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

        <button
          onClick={runAnalysis}
          disabled={aiLoading || dataLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary-500/15 border border-primary-500/30
            text-primary-400 text-xs font-semibold hover:bg-primary-500/25 transition-all
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {aiLoading
            ? <><Loader size={12} className="animate-spin" /> Analyzing…</>
            : <><Brain size={12} /> {aiResult ? 'Re-analyze' : 'Analyze with AI'}</>}
        </button>
        </div>
      </div>

      {/* Hard error — both quote and candles failed */}
      {dataError && !quote && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-bear/8 border border-bear/20 text-xs">
          <div className="flex items-center gap-2 text-bear">
            <AlertCircle size={13} />
            <span>{dataError}</span>
          </div>
          <button onClick={refresh}
            className="flex items-center gap-1 text-primary-400 hover:text-primary-300">
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {intradayMissing && timeframe === '1D' && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-hold/8 border border-hold/20 text-xs text-hold">
          <AlertCircle size={12} />
          <span>Intraday candles unavailable (Groww needs its live-data plan, Yahoo is rate-limiting) — showing the Daily view, up to the last close.</span>
        </div>
      )}

      {/* Soft warning — candles unavailable but quote works */}
      {!signal && quote && !dataLoading && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-hold/8 border border-hold/20 text-xs text-hold">
          <AlertCircle size={12} />
          <span>Chart history unavailable (Groww, Yahoo and NSE all refused) — AI analysis runs on live price only. Technical indicators will be N/A.</span>
        </div>
      )}

      {dataLoading && !signal && (
        <div className="h-8 rounded-xl bg-white/[0.04] animate-pulse" />
      )}

      {/* Engine vs AI — the real (math) verdict next to the LLM's opinion */}
      {(signal || aiResult) && <EngineVsAI signal={signal} aiResult={aiResult} record={record} />}

      {aiLoading && <ThinkingBar symbol={symbol} />}
      {errorMsg  && <ErrorCard error={errorMsg} />}
      {aiResult && !aiLoading && (
        <ClaudeResultCard
          result={aiResult}
          symbol={symbol}
          livePrice={quote?.price}
          signal={signal}
          chain={chain}
          plan={plan}
          record={record}
          delay={0}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const AIPredictions = () => {
  // The server says which AI provider it has a key for (keys never reach the browser)
  const [, setAiStatusLoaded] = useState(false)
  useEffect(() => { loadAIStatus().then(() => setAiStatusLoaded(true)) }, [])
  const hasKey   = isAIEnabled()
  const provider = getActiveProvider()
  const provInfo = provider ? PROVIDER_INFO[provider] : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center">
          <Brain size={20} className="text-primary-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">AI Predictions</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {hasKey
              ? `Powered by ${provInfo?.name} — real AI analysis`
              : 'Add a free Gemini or Groq API key to .env to enable'}
          </p>
        </div>
        <div className="ml-auto">
          {hasKey
            ? <Badge variant="bull" size="sm" pulse>{provInfo?.name} Active</Badge>
            : <Badge variant="hold" size="sm">No AI Key</Badge>}
        </div>
      </motion.div>

      {/* How it works — transparent explanation */}
      <GlassCard delay={0.05} className="p-4">
        <div className="flex items-start gap-3">
          <Cpu size={14} className="text-primary-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400 leading-relaxed space-y-1">
            <p>
              <span className="text-primary-400 font-semibold">How this actually works: </span>
              The formula engine (RSI + MACD + EMA + BB) calculates indicator values from candle data.
              Those values are sent to <span className="text-white">{hasKey ? provInfo?.name : 'an AI model (not connected yet)'}</span> with a structured prompt.
              The model reads the full picture and gives a second opinion — confirming or overriding the formula signal.
            </p>
            {!hasKey && (
              <p className="text-hold">
                ⚠️ Without an API key, this page shows nothing useful. The old "AI" predictions here were fake — just the formula dressed up with a different label.
              </p>
            )}
          </div>
        </div>
      </GlassCard>

      {!hasKey && <SetupCard />}

      {hasKey && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {SYMBOLS.map((sym, i) => (
            <motion.div
              key={sym}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 + 0.1 }}
            >
              <SymbolAnalysis symbol={sym} autoRun={i === 0} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Cost transparency */}
      {hasKey && (
        <GlassCard delay={0.4} className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={13} className="text-yellow-400" />
            <span className="text-xs font-semibold text-gray-300">API Cost Transparency</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
            {(provider === 'anthropic'
              ? [
                  { label: 'Model',         value: provInfo?.model || 'Claude Haiku' },
                  { label: 'Cost/analysis', value: '~$0.0003' },
                  { label: '100 calls',     value: '~$0.03' },
                  { label: '1000 calls',    value: '~$0.30' },
                ]
              : [
                  { label: 'Model',     value: provInfo?.model || '—' },
                  { label: 'Cost',      value: 'Free tier' },
                  { label: 'Daily cap', value: provInfo?.free || '—' },
                  { label: 'Provider',  value: provInfo?.name || '—' },
                ]
            ).map(item => (
              <div key={item.label} className="bg-white/[0.03] rounded-lg p-2">
                <div className="text-gray-600 mb-0.5">{item.label}</div>
                <div className="font-mono font-bold text-primary-400">{item.value}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}

export default AIPredictions
