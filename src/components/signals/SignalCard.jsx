import { motion } from 'framer-motion'
import { Target, Shield, TrendingUp, TrendingDown, Minus, Clock, Zap } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import Badge from '../ui/Badge'
import { formatPrice } from '../../utils/formatters'

const SignalRow = ({ label, value, icon: Icon, color }) => (
  <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <Icon size={12} className={color} />
      {label}
    </div>
    <span className={`text-sm font-mono font-semibold ${color}`}>₹{formatPrice(value)}</span>
  </div>
)

const SignalCard = ({ signal, symbol, delay = 0 }) => {
  if (!signal) return null

  const isBuy = signal.type === 'BUY'
  const isSell = signal.type === 'SELL'
  const isHold = signal.type === 'HOLD'

  const variant = isBuy ? 'bull' : isSell ? 'bear' : 'hold'
  const glowClass = isBuy ? 'shadow-bull' : isSell ? 'shadow-bear' : ''
  const gradientClass = isBuy ? 'from-bull/10 to-bull/3' : isSell ? 'from-bear/10 to-bear/3' : 'from-hold/10 to-hold/3'
  const borderClass = isBuy ? 'border-bull/25' : isSell ? 'border-bear/25' : 'border-hold/25'

  const Icon = isBuy ? TrendingUp : isSell ? TrendingDown : Minus
  const signalColor = isBuy ? 'text-bull' : isSell ? 'text-bear' : 'text-hold'

  return (
    <GlassCard delay={delay} className={`p-5 border ${borderClass} bg-gradient-to-br ${gradientClass} ${glowClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center
            ${isBuy ? 'bg-bull/15 border border-bull/25' : isSell ? 'bg-bear/15 border border-bear/25' : 'bg-hold/15 border border-hold/25'}`}>
            <Icon size={20} className={signalColor} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-mono uppercase tracking-wider">{symbol || 'NIFTY'}</div>
            <div className={`text-xl font-black tracking-wider ${signalColor}`}>{signal.type}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">Confidence</div>
          <div className={`text-2xl font-black font-mono ${signalColor}`}>{signal.confidence}%</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mb-4">
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${isBuy ? 'bg-bull' : isSell ? 'bg-bear' : 'bg-hold'}`}
            initial={{ width: 0 }}
            animate={{ width: `${signal.confidence}%` }}
            transition={{ duration: 1, delay: delay + 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Price levels */}
      <div className="mb-4 space-y-0">
        <SignalRow label="Entry Price" value={signal.entry} icon={Zap} color={signalColor} />
        <SignalRow label="Target" value={signal.target} icon={Target} color="text-bull" />
        <SignalRow label="Stop Loss" value={signal.stopLoss} icon={Shield} color="text-bear" />
      </div>

      {/* RR Ratio */}
      <div className="flex items-center justify-between bg-white/[0.04] rounded-xl p-3 mb-4">
        <div className="text-center">
          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Risk</div>
          <div className="text-sm font-mono font-semibold text-bear">
            ₹{Math.abs(signal.entry - signal.stopLoss).toFixed(0)}
          </div>
        </div>
        <div className="text-center border-x border-white/[0.06] px-4">
          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">R:R Ratio</div>
          <div className={`text-lg font-black font-mono ${signalColor}`}>1:{signal.rrRatio}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Reward</div>
          <div className="text-sm font-mono font-semibold text-bull">
            ₹{Math.abs(signal.target - signal.entry).toFixed(0)}
          </div>
        </div>
      </div>

      {/* Signal reasons */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Signal Basis</div>
        {signal.reasons?.slice(0, 4).map((r, i) => (
          <div key={i} className={`flex items-center gap-2 text-xs
            ${r.side === 'bull' ? 'text-bull/80' : r.side === 'bear' ? 'text-bear/80' : 'text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
              ${r.side === 'bull' ? 'bg-bull' : r.side === 'bear' ? 'bg-bear' : 'bg-gray-600'}`} />
            {r.text}
          </div>
        ))}
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-white/[0.05]">
        <Clock size={10} className="text-gray-600" />
        <span className="text-[10px] text-gray-600 font-mono">
          {new Date(signal.timestamp).toLocaleTimeString()}
        </span>
        <Badge variant={variant} size="sm" pulse className="ml-auto">
          {signal.type === 'HOLD' ? 'WATCH' : signal.type + ' NOW'}
        </Badge>
      </div>
    </GlassCard>
  )
}

export default SignalCard
