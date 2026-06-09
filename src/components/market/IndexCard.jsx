import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import AnimatedCounter from '../ui/AnimatedCounter'
import { formatPercent } from '../../utils/formatters'
import { CardSkeleton } from '../ui/LoadingSkeleton'

const MiniSparkline = ({ isPositive }) => {
  const points = isPositive
    ? '0,30 15,25 30,28 45,15 60,18 75,10 90,12 105,5'
    : '0,10 15,15 30,12 45,20 60,18 75,28 90,25 105,32'

  return (
    <svg width="105" height="40" className="opacity-60">
      <defs>
        <linearGradient id={`spark-${isPositive}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={isPositive ? '#00d4a1' : '#ff4d6d'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? '#00d4a1' : '#ff4d6d'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? '#00d4a1' : '#ff4d6d'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const IndexCard = ({ symbol, data, loading, delay = 0, onClick, isSelected }) => {
  if (loading) return <CardSkeleton />

  const isPositive = data?.changePercent >= 0
  const isNeutral = !data

  const labels = {
    NIFTY: 'NIFTY 50',
    BANKNIFTY: 'BANK NIFTY',
    SENSEX: 'BSE SENSEX',
    VIX: 'INDIA VIX',
  }

  return (
    <GlassCard
      delay={delay}
      hover={!!onClick}
      glow={isPositive ? 'bull' : 'bear'}
      onClick={onClick}
      className={`p-5 ${isSelected ? 'border-primary-500/40 shadow-glow' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-0.5">{symbol}</div>
          <div className="text-sm font-semibold text-gray-300">{labels[symbol] || symbol}</div>
        </div>
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border
          ${isPositive
            ? 'bg-bull/10 text-bull border-bull/20'
            : 'bg-bear/10 text-bear border-bear/20'
          }`}>
          {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {data ? formatPercent(data.changePercent) : '--'}
        </div>
      </div>

      <div className="mb-3">
        <div className={`text-2xl font-bold font-mono tracking-tight ${isPositive ? 'text-white' : 'text-white'}`}>
          {data ? (
            <AnimatedCounter value={data.price} decimals={symbol === 'VIX' ? 2 : 2} />
          ) : '--'}
        </div>
        <div className={`text-sm font-mono mt-0.5 ${isPositive ? 'text-bull' : 'text-bear'}`}>
          {data ? (isPositive ? '+' : '') + data.change?.toFixed(2) : '--'}
        </div>
      </div>

      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex gap-3 text-[11px] text-gray-600 font-mono">
            <span>H: <span className="text-gray-400">{data?.high?.toFixed(2) || '--'}</span></span>
            <span>L: <span className="text-gray-400">{data?.low?.toFixed(2) || '--'}</span></span>
          </div>
          <div className="text-[11px] text-gray-600 font-mono">
            Prev: <span className="text-gray-400">{data?.prevClose?.toFixed(2) || '--'}</span>
          </div>
        </div>
        <MiniSparkline isPositive={isPositive} />
      </div>

      {/* Bottom accent line */}
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl
        ${isPositive ? 'bg-gradient-to-r from-transparent via-bull/50 to-transparent' : 'bg-gradient-to-r from-transparent via-bear/50 to-transparent'}`}
      />
    </GlassCard>
  )
}

export default IndexCard
