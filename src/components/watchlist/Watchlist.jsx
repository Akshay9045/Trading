import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Star, Search, TrendingUp, TrendingDown } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import { useApp } from '../../context/AppContext'
import { getMockQuote } from '../../services/mockDataService'

const ALL_SYMBOLS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries' },
  { symbol: 'TCS', name: 'Tata Consultancy Services' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank' },
  { symbol: 'INFY', name: 'Infosys' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever' },
  { symbol: 'SBIN', name: 'State Bank of India' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank' },
  { symbol: 'LT', name: 'Larsen & Toubro' },
  { symbol: 'WIPRO', name: 'Wipro' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma' },
  { symbol: 'TITAN', name: 'Titan Company' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises' },
  { symbol: 'AXISBANK', name: 'Axis Bank' },
]

const WatchlistRow = ({ symbol, onRemove, onSelect }) => {
  const quote = getMockQuote(symbol)
  const isPositive = quote.changePercent >= 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.04] transition-colors group cursor-pointer"
      onClick={() => onSelect?.(symbol)}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
        ${isPositive ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
        {symbol.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{symbol}</div>
        <div className="text-[10px] text-gray-500 truncate">{quote.price?.toFixed(2)}</div>
      </div>
      <div className={`text-xs font-mono font-semibold flex items-center gap-0.5 ${isPositive ? 'text-bull' : 'text-bear'}`}>
        {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        {isPositive ? '+' : ''}{quote.changePercent?.toFixed(2)}%
      </div>
      <button
        onClick={e => { e.stopPropagation(); onRemove(symbol) }}
        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-bear transition-all p-0.5"
      >
        <X size={12} />
      </button>
    </motion.div>
  )
}

const Watchlist = ({ onSelectSymbol }) => {
  const { watchlist, addToWatchlist, removeFromWatchlist } = useApp()
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const suggestions = ALL_SYMBOLS.filter(s =>
    !watchlist.includes(s.symbol) &&
    (s.symbol.includes(search.toUpperCase()) || s.name.toLowerCase().includes(search.toLowerCase()))
  ).slice(0, 6)

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-yellow-400" />
          <h3 className="font-semibold text-sm text-gray-200">Watchlist</h3>
          <span className="text-[10px] text-gray-600 bg-white/[0.05] rounded-full px-2 py-0.5">{watchlist.length}</span>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="p-1.5 rounded-lg hover:bg-white/[0.08] text-gray-500 hover:text-white transition-all"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/[0.06]"
          >
            <div className="p-3">
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search symbol..."
                  className="w-full pl-8 pr-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/40"
                  autoFocus
                />
              </div>
              {suggestions.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {suggestions.map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => { addToWatchlist(s.symbol); setSearch(''); setShowSearch(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.05] transition-colors text-left"
                    >
                      <span className="text-sm font-semibold text-white">{s.symbol}</span>
                      <span className="text-xs text-gray-500 truncate">{s.name}</span>
                      <Plus size={12} className="ml-auto text-primary-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Watchlist items */}
      <div className="p-2 max-h-80 overflow-y-auto">
        <AnimatePresence>
          {watchlist.map(sym => (
            <WatchlistRow
              key={sym}
              symbol={sym}
              onRemove={removeFromWatchlist}
              onSelect={onSelectSymbol}
            />
          ))}
        </AnimatePresence>
        {watchlist.length === 0 && (
          <div className="text-center py-6 text-gray-600 text-sm">
            <Star size={24} className="mx-auto mb-2 opacity-30" />
            Add stocks to watchlist
          </div>
        )}
      </div>
    </GlassCard>
  )
}

export default Watchlist
