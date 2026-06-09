import { useState } from 'react'
import { motion } from 'framer-motion'
import { Star, TrendingUp, TrendingDown, Search, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getMockQuote } from '../services/mockDataService'
import { useMarketData } from '../hooks/useMarketData'
import GlassCard from '../components/ui/GlassCard'
import SignalCard from '../components/signals/SignalCard'
import Badge from '../components/ui/Badge'
import { formatPrice, formatPercent, formatVolume } from '../utils/formatters'

const ALL_SYMBOLS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Finance' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking' },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infra' },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'IT' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma' },
  { symbol: 'TITAN', name: 'Titan Company', sector: 'Consumer' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Conglomerate' },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'FMCG' },
]

const WatchlistDetailCard = ({ symbol, onRemove }) => {
  const { signal } = useMarketData(symbol, '1D')
  const quote = getMockQuote(symbol)
  const isPos = quote.changePercent >= 0

  return (
    <GlassCard className="p-4" hover>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{symbol}</span>
            {signal && (
              <Badge variant={signal.type === 'BUY' ? 'bull' : signal.type === 'SELL' ? 'bear' : 'hold'} size="sm">
                {signal.type}
              </Badge>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {ALL_SYMBOLS.find(s => s.symbol === symbol)?.name || symbol}
          </div>
        </div>
        <button onClick={() => onRemove(symbol)} className="text-gray-600 hover:text-bear transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-black font-mono text-white">{formatPrice(quote.price)}</div>
          <div className={`text-xs font-mono font-semibold flex items-center gap-1 mt-0.5 ${isPos ? 'text-bull' : 'text-bear'}`}>
            {isPos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {isPos ? '+' : ''}{quote.change?.toFixed(2)} ({formatPercent(quote.changePercent)})
          </div>
        </div>
        <div className="text-right text-[10px] text-gray-600 font-mono space-y-0.5">
          <div>Vol: {formatVolume(quote.volume)}</div>
          <div>H: {quote.high?.toFixed(2)} / L: {quote.low?.toFixed(2)}</div>
        </div>
      </div>

      {signal && (
        <div className="mt-3 pt-3 border-t border-white/[0.05] grid grid-cols-3 gap-2 text-center text-[10px]">
          <div>
            <div className="text-gray-600">Entry</div>
            <div className="font-mono text-white">{signal.entry?.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-gray-600">Target</div>
            <div className="font-mono text-bull">{signal.target?.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-gray-600">SL</div>
            <div className="font-mono text-bear">{signal.stopLoss?.toFixed(0)}</div>
          </div>
        </div>
      )}
    </GlassCard>
  )
}

const WatchlistPage = () => {
  const { watchlist, addToWatchlist, removeFromWatchlist } = useApp()
  const [search, setSearch] = useState('')
  const [selectedForDetail, setSelectedForDetail] = useState(null)
  const { signal: detailSignal } = useMarketData(selectedForDetail || 'NIFTY', '1D')

  const available = ALL_SYMBOLS.filter(s =>
    !watchlist.includes(s.symbol) &&
    (s.symbol.includes(search.toUpperCase()) || s.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">My Watchlist</h1>
          <p className="text-xs text-gray-500 mt-0.5">{watchlist.length} stocks tracked</p>
        </div>
        <Badge variant="info" size="sm">{watchlist.length} stocks</Badge>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Watchlist stocks */}
        <div className="xl:col-span-2 space-y-4">
          {watchlist.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {watchlist.map((sym, i) => (
                <motion.div
                  key={sym}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelectedForDetail(sym)}
                >
                  <WatchlistDetailCard symbol={sym} onRemove={removeFromWatchlist} />
                </motion.div>
              ))}
            </div>
          ) : (
            <GlassCard className="p-12 text-center">
              <Star size={40} className="mx-auto mb-3 text-gray-700" />
              <p className="text-gray-500">Your watchlist is empty</p>
              <p className="text-xs text-gray-600 mt-1">Add stocks from the panel on the right</p>
            </GlassCard>
          )}
        </div>

        {/* Right: Add stocks + detail */}
        <div className="space-y-4">
          <GlassCard className="overflow-hidden" delay={0.1}>
            <div className="p-4 border-b border-white/[0.06]">
              <h3 className="font-semibold text-sm text-gray-200 mb-3">Add to Watchlist</h3>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search stocks..."
                  className="w-full pl-8 pr-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/40"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {available.map(s => (
                <button
                  key={s.symbol}
                  onClick={() => addToWatchlist(s.symbol)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-xs font-bold text-gray-400 group-hover:text-white transition-colors">
                    {s.symbol.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-300 group-hover:text-white truncate">{s.symbol}</div>
                    <div className="text-[10px] text-gray-600 truncate">{s.sector}</div>
                  </div>
                  <Plus size={14} className="text-gray-600 group-hover:text-primary-400 transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>
          </GlassCard>

          {selectedForDetail && (
            <SignalCard signal={detailSignal} symbol={selectedForDetail} delay={0} />
          )}
        </div>
      </div>
    </div>
  )
}

export default WatchlistPage
