import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, Clock } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import Badge from '../ui/Badge'
import { formatPrice, timeAgo } from '../../utils/formatters'

const STATUS_CONFIG = {
  ACTIVE: { label: 'Active', variant: 'info', icon: Clock },
  TARGET_HIT: { label: 'Target Hit', variant: 'success', icon: CheckCircle },
  SL_HIT: { label: 'SL Hit', variant: 'error', icon: XCircle },
  CLOSED: { label: 'Closed', variant: 'neutral', icon: Minus },
}

const SignalRow = ({ sig, index }) => {
  const isBuy = sig.type === 'BUY'
  const isSell = sig.type === 'SELL'
  const status = STATUS_CONFIG[sig.status] || STATUS_CONFIG.CLOSED
  const StatusIcon = status.icon

  return (
    <motion.tr
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
    >
      <td className="py-3 px-3 text-left">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center
            ${isBuy ? 'bg-bull/15' : isSell ? 'bg-bear/15' : 'bg-hold/15'}`}>
            {isBuy ? <TrendingUp size={12} className="text-bull" /> :
              isSell ? <TrendingDown size={12} className="text-bear" /> :
              <Minus size={12} className="text-hold" />}
          </div>
          <div>
            <div className="text-xs font-mono font-semibold text-white">{sig.symbol}</div>
            <div className={`text-[10px] font-bold ${isBuy ? 'text-bull' : isSell ? 'text-bear' : 'text-hold'}`}>
              {sig.type}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-3 text-right font-mono text-xs text-white">₹{formatPrice(sig.entry)}</td>
      <td className="py-3 px-3 text-right font-mono text-xs text-bull">₹{formatPrice(sig.target)}</td>
      <td className="py-3 px-3 text-right font-mono text-xs text-bear">₹{formatPrice(sig.stopLoss)}</td>
      <td className="py-3 px-3 text-right">
        <div className={`text-xs font-mono font-semibold
          ${sig.pnl > 0 ? 'text-bull' : sig.pnl < 0 ? 'text-bear' : 'text-gray-400'}`}>
          {sig.pnl !== null ? `${sig.pnl > 0 ? '+' : ''}₹${Math.abs(sig.pnl).toFixed(0)}` : '--'}
        </div>
      </td>
      <td className="py-3 px-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <div className="w-12 bg-white/[0.06] rounded-full h-1">
            <div className="h-full bg-primary-400 rounded-full" style={{ width: `${sig.confidence}%` }} />
          </div>
          <span className="text-[10px] font-mono text-gray-400">{sig.confidence}%</span>
        </div>
      </td>
      <td className="py-3 px-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <StatusIcon size={10} className={
            status.variant === 'success' ? 'text-bull' :
            status.variant === 'error' ? 'text-bear' :
            status.variant === 'info' ? 'text-primary-400' : 'text-gray-500'
          } />
          <Badge variant={status.variant} size="sm">{status.label}</Badge>
        </div>
      </td>
      <td className="py-3 px-3 text-right text-[10px] text-gray-600 font-mono whitespace-nowrap">
        {timeAgo(sig.timestamp)}
      </td>
    </motion.tr>
  )
}

const SignalTable = ({ signals, delay = 0 }) => (
  <GlassCard delay={delay} className="overflow-hidden">
    <div className="p-4 border-b border-white/[0.06]">
      <h3 className="font-semibold text-gray-200 text-sm">Signal History</h3>
      <p className="text-xs text-gray-500 mt-0.5">All recent trading signals with outcomes</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {['Symbol', 'Entry', 'Target', 'Stop Loss', 'P&L', 'Confidence', 'Status', 'Time'].map(h => (
              <th key={h} className="py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600 text-right first:text-left whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((sig, i) => <SignalRow key={sig.id} sig={sig} index={i} />)}
        </tbody>
      </table>
    </div>
  </GlassCard>
)

export default SignalTable
