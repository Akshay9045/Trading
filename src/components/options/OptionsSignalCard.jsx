import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Target, Shield, Clock, AlertCircle, Zap, ArrowRight, ChevronRight } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import Badge from '../ui/Badge'
import { formatPrice } from '../../utils/formatters'

// ── Small helper rows ────────────────────────────────────────────────────────
const Row = ({ label, value, valueClass = 'text-white', sublabel }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      {sublabel && <div className="text-[10px] text-gray-700 mt-0.5">{sublabel}</div>}
    </div>
    <div className={`text-sm font-mono font-bold ${valueClass}`}>{value}</div>
  </div>
)

// ── Strike selector chip ─────────────────────────────────────────────────────
const StrikeChip = ({ label, strike, premium, active }) => (
  <div className={`flex-1 rounded-xl p-3 text-center border transition-all
    ${active
      ? 'border-primary-500/40 bg-primary-500/10'
      : 'border-white/[0.07] bg-white/[0.03]'
    }`}>
    <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{label}</div>
    <div className={`text-sm font-mono font-bold ${active ? 'text-primary-400' : 'text-gray-300'}`}>
      {strike}
    </div>
    <div className="text-[10px] text-gray-600 mt-1 font-mono">
      ~₹{premium}
    </div>
  </div>
)

// ── WAIT card shown when signal is HOLD ─────────────────────────────────────
const WaitCard = ({ signal, delay }) => (
  <GlassCard delay={delay} className="p-6 border-hold/20 bg-hold/5">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-hold/15 border border-hold/25 flex items-center justify-center">
        <Clock size={20} className="text-hold" />
      </div>
      <div>
        <div className="text-xl font-black text-hold tracking-wide">WAIT</div>
        <div className="text-xs text-gray-500">{signal.symbol} · No clear signal</div>
      </div>
      <Badge variant="hold" size="sm" className="ml-auto">HOLD</Badge>
    </div>
    <p className="text-sm text-gray-400 leading-relaxed">{signal.message}</p>
    <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
      <AlertCircle size={12} />
      <span>Avoid trading in sideways/choppy market to protect capital</span>
    </div>
  </GlassCard>
)

// ── Main options signal card ─────────────────────────────────────────────────
const OptionsSignalCard = ({ optionsSignal, delay = 0 }) => {
  if (!optionsSignal) return null
  if (optionsSignal.action === 'WAIT') return <WaitCard signal={optionsSignal} delay={delay} />

  const isCall = optionsSignal.optionType === 'CALL'
  const color  = isCall ? 'bull' : 'bear'
  const Icon   = isCall ? TrendingUp : TrendingDown
  const borderClass    = isCall ? 'border-bull/25' : 'border-bear/25'
  const gradientClass  = isCall ? 'from-bull/8 to-bull/2'  : 'from-bear/8 to-bear/2'
  const accentColor    = isCall ? 'text-bull'               : 'text-bear'
  const accentBg       = isCall ? 'bg-bull/15 border-bull/25' : 'bg-bear/15 border-bear/25'

  return (
    <GlassCard
      delay={delay}
      className={`border ${borderClass} bg-gradient-to-br ${gradientClass}`}
    >
      {/* ── Header ── */}
      <div className={`p-5 border-b ${isCall ? 'border-bull/10' : 'border-bear/10'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${accentBg}`}>
              <Icon size={24} className={accentColor} />
            </div>
            <div>
              <div className={`text-2xl font-black tracking-widest ${accentColor}`}>
                {isCall ? 'BUY CALL' : 'BUY PUT'}
              </div>
              <div className="text-xs text-gray-500 font-mono mt-0.5">
                {optionsSignal.symbol} &middot; Weekly
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-600 uppercase tracking-wide">Confidence</div>
            <div className={`text-3xl font-black font-mono ${accentColor}`}>
              {optionsSignal.confidence}%
            </div>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-4 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${isCall ? 'bg-bull' : 'bg-bear'}`}
            initial={{ width: 0 }}
            animate={{ width: `${optionsSignal.confidence}%` }}
            transition={{ duration: 1, delay: delay + 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* ── Core trade info ── */}
      <div className="p-5 space-y-0">
        <Row
          label="Spot Entry"
          sublabel="Current market price — enter near this level"
          value={`₹${formatPrice(optionsSignal.spotEntry)}`}
          valueClass={accentColor}
        />
        <Row
          label="Target (Spot)"
          sublabel={`+${optionsSignal.pointsTarget} points move expected`}
          value={`₹${formatPrice(optionsSignal.spotTarget)}`}
          valueClass="text-bull"
        />
        <Row
          label="Stop Loss (Spot)"
          sublabel={`Exit if spot crosses this — −${optionsSignal.pointsSL} points`}
          value={`₹${formatPrice(optionsSignal.spotStopLoss)}`}
          valueClass="text-bear"
        />
        <Row
          label="Expiry"
          sublabel="Weekly options expiry"
          value={optionsSignal.expiry}
          valueClass="text-gray-300"
        />
      </div>

      {/* ── BUY THIS OPTION banner ── */}
      <div className={`mx-5 mb-3 rounded-xl border p-4 ${isCall ? 'bg-bull/10 border-bull/30' : 'bg-bear/10 border-bear/30'}`}>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Buy This Option</div>
        <div className={`text-xl font-black font-mono tracking-wide ${accentColor}`}>
          {optionsSignal.symbol} {optionsSignal.atmStrike} {optionsSignal.optionType === 'CALL' ? 'CE' : 'PE'}
        </div>
        <div className="text-xs text-gray-400 font-mono mt-1">
          Expiry: <span className="text-white font-bold">{optionsSignal.expiry}</span>
          &nbsp;·&nbsp; Buy at: <span className={`font-bold ${accentColor}`}>~₹{optionsSignal.atmPremium}</span>
          &nbsp;·&nbsp; Target: <span className="text-bull font-bold">~₹{optionsSignal.premiumTarget}</span>
          &nbsp;·&nbsp; SL: <span className="text-bear font-bold">~₹{optionsSignal.premiumSL}</span>
        </div>
      </div>

      {/* ── Strike selection ── */}
      <div className="px-5 pb-4">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">
          All Strikes — {optionsSignal.optionType === 'CALL' ? 'CE' : 'PE'}
        </div>
        <div className="flex gap-2">
          <StrikeChip
            label="ITM"
            strike={`${optionsSignal.itmStrike} ${optionsSignal.optionType === 'CALL' ? 'CE' : 'PE'}`}
            premium={optionsSignal.itmPremium}
            active={false}
          />
          <StrikeChip
            label="ATM ✓"
            strike={`${optionsSignal.atmStrike} ${optionsSignal.optionType === 'CALL' ? 'CE' : 'PE'}`}
            premium={optionsSignal.atmPremium}
            active={true}
          />
          <StrikeChip
            label="OTM"
            strike={`${optionsSignal.otmStrike} ${optionsSignal.optionType === 'CALL' ? 'CE' : 'PE'}`}
            premium={optionsSignal.otmPremium}
            active={false}
          />
        </div>
      </div>

      {/* ── Premium target / SL ── */}
      <div className="mx-5 mb-4 rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-3">
          ATM Option Premium Targets
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] text-gray-600 mb-1">Buy At</div>
            <div className={`text-base font-black font-mono ${accentColor}`}>
              ~₹{optionsSignal.atmPremium}
            </div>
          </div>
          <div className="border-x border-white/[0.06]">
            <div className="text-[10px] text-gray-600 mb-1">Target</div>
            <div className="text-base font-black font-mono text-bull">
              ~₹{optionsSignal.premiumTarget}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-600 mb-1">Stop Loss</div>
            <div className="text-base font-black font-mono text-bear">
              ~₹{optionsSignal.premiumSL}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-600">
          <Zap size={10} />
          <span>R:R = 1:{optionsSignal.rrRatio} &nbsp;·&nbsp; Premium targets are approximate</span>
        </div>
      </div>

      {/* ── Why this trade ── */}
      <div className="px-5 pb-5">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">
          Why {isCall ? 'Call' : 'Put'}?
        </div>
        <div className="space-y-1.5">
          {optionsSignal.reasons?.filter(r => r.side === (isCall ? 'bull' : 'bear')).slice(0, 4).map((r, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs ${accentColor} opacity-80`}>
              <ChevronRight size={11} className="flex-shrink-0" />
              {r.text}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-white/[0.05] text-[10px] text-gray-700">
          <AlertCircle size={10} />
          <span>Options premiums are indicative. Check live quotes before trading. Not financial advice.</span>
        </div>
      </div>
    </GlassCard>
  )
}

export default OptionsSignalCard
