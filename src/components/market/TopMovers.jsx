import { TrendingUp, TrendingDown } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import { formatVolume } from '../../utils/formatters'

const MoverRow = ({ item, index }) => {
  const isPositive = item.change >= 0
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] rounded-lg px-2 transition-colors">
      <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-mono text-gray-500">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{item.symbol}</div>
        <div className="text-[11px] text-gray-500 truncate">{item.name}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-mono font-semibold text-white">
          {item.price?.toFixed(2)}
        </div>
        <div className={`flex items-center justify-end gap-0.5 text-xs font-mono ${isPositive ? 'text-bull' : 'text-bear'}`}>
          {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {isPositive ? '+' : ''}{item.change?.toFixed(2)}%
        </div>
      </div>
    </div>
  )
}

const TopMovers = ({ data, loading, delay = 0 }) => {
  if (loading || !data) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <GlassCard delay={delay} className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-bull rounded-full animate-pulse" />
          <h3 className="font-semibold text-sm text-gray-300 uppercase tracking-wider">Top Gainers</h3>
        </div>
        <div className="space-y-0.5">
          {data.gainers.map((item, i) => <MoverRow key={item.symbol} item={item} index={i} />)}
        </div>
      </GlassCard>

      <GlassCard delay={delay + 0.05} className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-bear rounded-full animate-pulse" />
          <h3 className="font-semibold text-sm text-gray-300 uppercase tracking-wider">Top Losers</h3>
        </div>
        <div className="space-y-0.5">
          {data.losers.map((item, i) => <MoverRow key={item.symbol} item={item} index={i} />)}
        </div>
      </GlassCard>
    </div>
  )
}

export default TopMovers
