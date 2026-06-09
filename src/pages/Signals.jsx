import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Filter, TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useMarketData } from '../hooks/useMarketData'
import SignalCard from '../components/signals/SignalCard'
import SignalTable from '../components/signals/SignalTable'
import GlassCard from '../components/ui/GlassCard'
import Badge from '../components/ui/Badge'

const NIFTY_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY']

const MultiSignal = ({ symbol, delay }) => {
  const { candles, signal } = useMarketData(symbol, '1D')
  return signal ? <SignalCard signal={signal} symbol={symbol} delay={delay} /> : null
}

const StatsCard = ({ icon: Icon, label, value, sub, color }) => (
  <GlassCard className="p-4" hover>
    <div className="flex items-center justify-between mb-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color === 'bull' ? 'bg-bull/15' : color === 'bear' ? 'bg-bear/15' : 'bg-primary-500/15'}`}>
        <Icon size={16} className={color === 'bull' ? 'text-bull' : color === 'bear' ? 'text-bear' : 'text-primary-400'} />
      </div>
    </div>
    <div className={`text-2xl font-black font-mono ${color === 'bull' ? 'text-bull' : color === 'bear' ? 'text-bear' : 'text-white'}`}>{value}</div>
    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
  </GlassCard>
)

const Signals = () => {
  const { signalHistory } = useApp()
  const [filter, setFilter] = useState('ALL')

  const stats = {
    buy: signalHistory.filter(s => s.type === 'BUY').length,
    sell: signalHistory.filter(s => s.type === 'SELL').length,
    hold: signalHistory.filter(s => s.type === 'HOLD').length,
    wins: signalHistory.filter(s => s.status === 'TARGET_HIT').length,
    losses: signalHistory.filter(s => s.status === 'SL_HIT').length,
    active: signalHistory.filter(s => s.status === 'ACTIVE').length,
  }

  const winRate = stats.wins + stats.losses > 0
    ? Math.floor((stats.wins / (stats.wins + stats.losses)) * 100)
    : 0

  const filtered = filter === 'ALL' ? signalHistory : signalHistory.filter(s => s.type === filter || s.status === filter)

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Trading Signals</h1>
          <p className="text-xs text-gray-500 mt-0.5">AI-powered buy/sell/hold signals</p>
        </div>
        <Badge variant="info" size="sm" pulse>{stats.active} Active</Badge>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatsCard icon={TrendingUp} label="Buy Signals" value={stats.buy} color="bull" />
        <StatsCard icon={TrendingDown} label="Sell Signals" value={stats.sell} color="bear" />
        <StatsCard icon={Minus} label="Hold Signals" value={stats.hold} color="hold" />
        <StatsCard icon={CheckCircle} label="Target Hit" value={stats.wins} color="bull" />
        <StatsCard icon={XCircle} label="SL Hit" value={stats.losses} color="bear" />
        <StatsCard icon={Zap} label="Win Rate" value={`${winRate}%`} color={winRate > 60 ? 'bull' : 'bear'} sub="Closed trades" />
      </div>

      {/* Live signals grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Signals</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {NIFTY_SYMBOLS.map((sym, i) => (
            <MultiSignal key={sym} symbol={sym} delay={i * 0.05} />
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 flex items-center gap-1"><Filter size={12} /> Filter:</span>
        {['ALL', 'BUY', 'SELL', 'HOLD', 'ACTIVE', 'TARGET_HIT', 'SL_HIT'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all
              ${filter === f
                ? f === 'BUY' ? 'bg-bull/15 text-bull border-bull/30'
                  : f === 'SELL' ? 'bg-bear/15 text-bear border-bear/30'
                  : 'bg-primary-500/15 text-primary-400 border-primary-500/30'
                : 'bg-white/[0.04] text-gray-500 border-white/[0.08] hover:text-gray-300'
              }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Signal history table */}
      <SignalTable signals={filtered} delay={0.2} />
    </div>
  )
}

export default Signals
