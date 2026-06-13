import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Cpu, Zap, RefreshCw, AlertCircle, CheckCircle,
  TrendingUp, TrendingDown, Minus, Key, ExternalLink, Loader, Clock
} from 'lucide-react'
import { useMarketData, useRealtimeQuote } from '../hooks/useMarketData'
import { getClaudeAnalysis, isAIEnabled, getActiveProvider, PROVIDER_INFO } from '../services/claudeService'
import { generateSignal } from '../services/signalEngine'
import { getNextExpiry, getMonthlyExpiry, getATMStrike, getOTMStrike, getITMStrike } from '../services/optionsEngine'
import GlassCard from '../components/ui/GlassCard'
import Badge from '../components/ui/Badge'
import { formatPrice } from '../utils/formatters'

const SYMBOLS = ['NIFTY', 'BANKNIFTY']

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
          envKey: 'VITE_GEMINI_API_KEY',
          example: 'AIzaSyXXXXXXXXXXXXXXXX',
          color: 'border-blue-500/20 bg-blue-500/5',
        },
        {
          name: 'Groq (Llama 3 — 70B)',
          tag: 'FREE',
          tagColor: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
          limit: '6,000 calls/day · 30/min',
          url: 'https://console.groq.com',
          urlLabel: 'console.groq.com → API Keys → Create',
          envKey: 'VITE_GROQ_API_KEY',
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
          envKey: 'VITE_ANTHROPIC_API_KEY',
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
      <div className="text-gray-600 mb-2"># Paste into: /Users/akdhingra/Documents/Trading/.env</div>
      <div className="text-gray-400">VITE_GEMINI_API_KEY=<span className="text-bull">your-key-here</span></div>
    </div>

    <div className="flex items-center gap-2 text-xs text-hold">
      <AlertCircle size={12} />
      After adding the key, restart the server: <code className="text-primary-400 bg-white/[0.06] px-1.5 py-0.5 rounded">npm run dev</code>
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
const ClaudeResultCard = ({ result, symbol, livePrice, signal, gate = 65, delay = 0 }) => {
  if (!result || result.error) return null

  const aiName        = PROVIDER_INFO[result.provider]?.name || 'AI'
  const isCall        = result.optionType === 'CALL'
  const isPut         = result.optionType === 'PUT'
  const color         = isCall ? 'bull' : isPut ? 'bear' : 'hold'
  const Icon          = isCall ? TrendingUp : isPut ? TrendingDown : Minus
  const weeklyExpiry  = getNextExpiry()
  const monthlyExpiry = getMonthlyExpiry()

  // The actionable option follows the ENGINE (math, ≥65% gate) — NOT the LLM's guess
  const engPass    = signal && signal.type !== 'HOLD' && signal.confidence >= gate
  const engDir     = engPass ? (signal.type === 'BUY' ? 'CALL' : 'PUT') : null
  const engIsCall  = engDir === 'CALL'
  const engSuffix  = engIsCall ? 'CE' : 'PE'
  const engPrice   = livePrice || signal?.entry || 0
  const atmStrike  = engDir && engPrice ? getATMStrike(engPrice, symbol) : null
  const itmStrike  = engDir && engPrice ? getITMStrike(engPrice, symbol, engDir) : null
  const otmStrike  = engDir && engPrice ? getOTMStrike(engPrice, symbol, engDir) : null

  return (
    <GlassCard
      delay={delay}
      className={`border-${color}/25 bg-gradient-to-br from-${color}/8 to-${color}/2`}
    >
      {/* ⚠️ Risk disclaimer — these numbers are AI-generated estimates, NOT advice */}
      <div className="px-5 pt-4">
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bear/15 border border-bear/40">
          <AlertCircle size={14} className="text-bear flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-bear leading-snug">
            <span className="font-bold">Research / paper-trading only — NOT financial advice.</span> These levels are
            unvalidated AI estimates and are frequently wrong. Do not trade real money on them.
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
              <div className={`text-2xl font-black tracking-widest text-${color}`}>
                {result.signal === 'HOLD' ? 'WAIT' : `BUY ${result.optionType}`}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 font-mono">{symbol}</span>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary-500/10 border border-primary-500/20">
                  <Brain size={9} className="text-primary-400" />
                  <span className="text-[9px] text-primary-400 font-mono font-bold">{aiName}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] text-gray-600 uppercase tracking-wide">AI Confidence</div>
            <div className={`text-3xl font-black font-mono text-${color}`}>{result.confidence}%</div>
          </div>
        </div>

        {/* Expiry dates */}
        <div className="mt-3 flex items-center gap-2">
          <Clock size={11} className="text-gray-500 flex-shrink-0" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Analysis for expiry:</span>
          <div className="flex items-center gap-2 ml-1">
            <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border
              bg-${color}/15 border-${color}/30 text-${color}`}>
              Weekly · {weeklyExpiry}
            </span>
            <span className="text-[10px] text-gray-600 font-mono">
              Monthly · {monthlyExpiry}
            </span>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-4 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full bg-${color}`}
            initial={{ width: 0 }}
            animate={{ width: `${result.confidence}%` }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: delay + 0.3 }}
          />
        </div>
      </div>

      {/* Price levels — from the ENGINE (ATR-based, precise), not the LLM's round guesses */}
      <div className="p-5 border-b border-white/[0.06]">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
          Engine Levels <span className="text-gray-700">· ATR-based (calculated, not guessed)</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Entry',     value: signal?.entry,    cls: 'text-white' },
            { label: 'Target',    value: signal?.target,   cls: 'text-bull' },
            { label: 'Stop Loss', value: signal?.stopLoss, cls: 'text-bear' },
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

        {/* Live price vs engine entry */}
        {livePrice && signal?.entry && (
          <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04] text-xs font-mono">
            <span className="text-gray-600">Live Rate</span>
            <span className="text-white font-bold">₹{formatPrice(livePrice)}</span>
            <span className="text-gray-400">engine entry ₹{formatPrice(signal.entry)}</span>
          </div>
        )}

        {/* Actionable option — driven by the ENGINE (math, ≥65% gate), NOT the LLM */}
        {engPass ? (
          <div className={`mt-3 rounded-xl border p-3
            ${engIsCall ? 'bg-bull/10 border-bull/30' : 'bg-bear/10 border-bear/30'}`}>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
              Buy This Option <span className={engIsCall ? 'text-bull' : 'text-bear'}>· Engine {signal.confidence}%</span>
            </div>
            <div className={`text-lg font-black font-mono ${engIsCall ? 'text-bull' : 'text-bear'}`}>
              {symbol} {atmStrike} {engSuffix}
            </div>
            <div className="text-[11px] text-gray-400 font-mono mt-1">
              Expiry: <span className="text-white font-bold">{weeklyExpiry}</span>
            </div>
            {/* Real backtested numbers for this setup */}
            {signal?.calibrated && (
              <div className="text-[11px] font-mono mt-1">
                <span className={signal.backtestWinRate >= 50 ? 'text-bull' : 'text-bear'}>
                  {signal.backtestWinRate}% backtested win
                </span>
                <span className="text-gray-600"> · </span>
                <span className={signal.expectancy > 0 ? 'text-bull' : 'text-bear'}>
                  {signal.expectancy} R/trade
                </span>
                <span className="text-gray-600"> (n={signal.backtestSamples})</span>
              </div>
            )}
            {/* 3 strikes */}
            <div className="flex gap-2 mt-2">
              {[
                { label: 'ITM', strike: itmStrike },
                { label: 'ATM ✓', strike: atmStrike, active: true },
                { label: 'OTM', strike: otmStrike },
              ].map(s => (
                <div key={s.label} className={`flex-1 rounded-lg py-2 text-center border text-xs font-mono
                  ${s.active
                    ? (engIsCall ? 'bg-bull/15 border-bull/40 text-bull font-bold' : 'bg-bear/15 border-bear/40 text-bear font-bold')
                    : 'bg-white/[0.04] border-white/10 text-gray-400'}`}>
                  <div className="text-[9px] text-gray-600 mb-0.5">{s.label}</div>
                  {s.strike} {engSuffix}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-hold/30 bg-hold/10 p-3">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Engine Verdict</div>
            <div className="text-base font-black text-hold">WAIT — no option to buy</div>
            <div className="text-[11px] text-gray-400 mt-1">
              Engine {signal ? `${signal.confidence}%` : '—'} (needs ≥{gate}% + a clean trend). The AI's pick above is an
              unvalidated opinion — don't trade it.
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
          variant={result.agreesWithFormula ? 'bull' : 'hold'}
          size="sm"
        >
          {result.agreesWithFormula ? '✓ Both Agree' : '⚡ AI Overrides Formula'}
        </Badge>
      </div>
    </GlassCard>
  )
}

// ── Engine (math, backtested) vs AI (LLM opinion) — side by side ──────────────
const EngineVsAI = ({ signal, aiResult, gate = 65 }) => {
  // Math-engine verdict with the conviction gate (65% strict / 50% aggressive)
  const eng = (() => {
    if (!signal) return { action: 'NO DATA', conf: null, color: 'gray-500', tag: 'no candles' }
    const pass = signal.type !== 'HOLD' && signal.confidence >= gate
    if (!pass) return { action: 'WAIT', conf: signal.confidence, color: 'hold', tag: signal.type === 'HOLD' ? 'no strong trend' : `below ${gate}% gate` }
    return { action: signal.type === 'BUY' ? 'BUY CALL' : 'BUY PUT', conf: signal.confidence, color: signal.type === 'BUY' ? 'bull' : 'bear', tag: 'tradeable setup' }
  })()

  const ai = aiResult && !aiResult.error
    ? {
        action: aiResult.signal === 'HOLD' ? 'WAIT'
          : aiResult.optionType === 'CALL' ? 'BUY CALL'
          : aiResult.optionType === 'PUT'  ? 'BUY PUT' : 'WAIT',
        conf: aiResult.confidence,
      }
    : null

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Engine — the trustworthy, backtested one */}
      <div className={`rounded-xl border border-${eng.color}/40 bg-${eng.color}/10 p-4`}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-bold text-bull uppercase tracking-wider">✓ Engine</span>
          <span className="text-[9px] text-gray-500">backtested · trust this</span>
        </div>
        <div className={`text-2xl font-black text-${eng.color}`}>{eng.action}</div>
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
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">AI opinion</span>
          <span className="text-[9px] text-bear">unvalidated · often wrong</span>
        </div>
        <div className="text-2xl font-black text-gray-400">{ai ? ai.action : '—'}</div>
        <div className="text-xs text-gray-500 mt-1">
          {ai ? <><span className="font-bold">{ai.conf}%</span> <span className="text-gray-600">· LLM guess</span></> : 'not run yet'}
        </div>
      </div>
    </div>
  )
}

// ── Single symbol analysis block ─────────────────────────────────────────────
const SymbolAnalysis = ({ symbol, autoRun }) => {
  // Intraday by default — matches same-day weekly-option trading. '1D' = swing view.
  const [timeframe, setTimeframe] = useState('15m')
  const [aggressive, setAggressive] = useState(false)   // OFF = strict 65% (disciplined); ON = 50%, no ADX filter
  const { signal: strictSignal, candles, quote: marketQuote, loading: dataLoading, error: dataError, refresh } = useMarketData(symbol, timeframe)

  // In aggressive mode, re-run the engine with relaxed filters (no ADX gate) so weaker setups surface
  const signal = useMemo(() => {
    if (!aggressive) return strictSignal
    if (!candles?.length) return strictSignal
    return generateSignal(candles, { adxMin: 0, trendFilter: true, targetATR: 1, stopATR: 1 })
  }, [aggressive, candles, strictSignal])
  const gate = aggressive ? 50 : 65
  const { quote: liveQuote }  = useRealtimeQuote(symbol, 5000)
  const quote                 = liveQuote || marketQuote
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
    const result = await getClaudeAnalysis(symbol, indicators, signal, quote)
    if (result.error) {
      setErrorMsg(result.message)
    } else {
      setAiResult(result)
      setCallCount(c => c + 1)
    }
    setAiLoading(false)
  }, [symbol, signal, quote, dataLoading])

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

          {/* Aggressive toggle — OFF = strict 65% (disciplined), ON = 50% (more trades, lower quality) */}
          <button
            onClick={() => setAggressive(a => !a)}
            title={aggressive
              ? 'Aggressive: trades at ≥50% (backtest: these lose money). Click for Strict.'
              : 'Strict: only ≥65% high-quality setups. Click for Aggressive (≥50%).'}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all
              ${aggressive
                ? 'bg-bear/20 border-bear/50 text-bear'
                : 'bg-bull/15 border-bull/40 text-bull'}`}
          >
            {aggressive ? '⚠ Aggressive 50%' : '✓ Strict 65%'}
          </button>
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

      {/* Soft warning — candles unavailable but quote works */}
      {!signal && quote && !dataLoading && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-hold/8 border border-hold/20 text-xs text-hold">
          <AlertCircle size={12} />
          <span>Chart history unavailable (Yahoo Finance rate limit) — AI analysis runs on live price only. Technical indicators will be N/A.</span>
        </div>
      )}

      {dataLoading && !signal && (
        <div className="h-8 rounded-xl bg-white/[0.04] animate-pulse" />
      )}

      {/* Engine vs AI — the real (math) verdict next to the LLM's opinion */}
      {(signal || aiResult) && <EngineVsAI signal={signal} aiResult={aiResult} gate={gate} />}

      {aiLoading && <ThinkingBar symbol={symbol} />}
      {errorMsg  && <ErrorCard error={errorMsg} />}
      {aiResult && !aiLoading && (
        <ClaudeResultCard
          result={aiResult}
          symbol={symbol}
          livePrice={quote?.price}
          signal={signal}
          gate={gate}
          delay={0}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const AIPredictions = () => {
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
