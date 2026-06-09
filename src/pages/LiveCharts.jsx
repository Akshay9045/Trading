import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, ChevronDown } from 'lucide-react'
import { useMarketData } from '../hooks/useMarketData'
import CandlestickChart from '../components/charts/CandlestickChart'
import IndicatorPanel from '../components/indicators/IndicatorPanel'
import GlassCard from '../components/ui/GlassCard'
import Badge from '../components/ui/Badge'
import { formatPrice, formatPercent } from '../utils/formatters'

const SYMBOLS = [
  { value: 'NIFTY', label: 'NIFTY 50' },
  { value: 'BANKNIFTY', label: 'BANK NIFTY' },
  { value: 'RELIANCE', label: 'Reliance' },
  { value: 'TCS', label: 'TCS' },
  { value: 'HDFCBANK', label: 'HDFC Bank' },
  { value: 'INFY', label: 'Infosys' },
  { value: 'ICICIBANK', label: 'ICICI Bank' },
  { value: 'SBIN', label: 'SBI' },
  { value: 'MARUTI', label: 'Maruti' },
  { value: 'BAJFINANCE', label: 'Bajaj Finance' },
]

const StatBox = ({ label, value, sub }) => (
  <div className="bg-white/[0.04] rounded-xl p-3 text-center">
    <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{label}</div>
    <div className="text-sm font-mono font-bold text-white">{value}</div>
    {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
  </div>
)

const LiveCharts = () => {
  const [symbol, setSymbol] = useState('NIFTY')
  const [timeframe, setTimeframe] = useState('1D')
  const [showSymbolPicker, setShowSymbolPicker] = useState(false)
  const { candles, quote, signal, loading } = useMarketData(symbol, timeframe)

  const isPositive = quote?.changePercent >= 0

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Live Charts</h1>
          <p className="text-xs text-gray-500 mt-0.5">Interactive candlestick charts with indicators</p>
        </div>

        {/* Symbol picker */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowSymbolPicker(!showSymbolPicker)}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm font-semibold hover:bg-white/[0.1] transition-all"
          >
            {SYMBOLS.find(s => s.value === symbol)?.label}
            <ChevronDown size={14} className={`transition-transform ${showSymbolPicker ? 'rotate-180' : ''}`} />
          </button>
          {showSymbolPicker && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-dark-100/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-glass-lg z-20 py-1 overflow-hidden">
              {SYMBOLS.map(s => (
                <button
                  key={s.value}
                  onClick={() => { setSymbol(s.value); setShowSymbolPicker(false) }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/[0.06] transition-colors flex items-center justify-between
                    ${symbol === s.value ? 'text-primary-400 bg-primary-500/10' : 'text-gray-300'}`}
                >
                  <span>{s.label}</span>
                  <span className="text-xs text-gray-600 font-mono">{s.value}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Quote stats */}
      {quote && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <div className="sm:col-span-2 bg-white/[0.04] border border-white/[0.06] rounded-xl p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{symbol}</div>
            <div className={`text-2xl font-black font-mono ${isPositive ? 'text-bull' : 'text-bear'}`}>
              {formatPrice(quote.price)}
            </div>
            <div className={`text-sm font-mono font-semibold ${isPositive ? 'text-bull' : 'text-bear'}`}>
              {isPositive ? '+' : ''}{quote.change?.toFixed(2)} ({formatPercent(quote.changePercent)})
            </div>
          </div>
          <StatBox label="Open" value={formatPrice(quote.open)} />
          <StatBox label="High" value={formatPrice(quote.high)} />
          <StatBox label="Low" value={formatPrice(quote.low)} />
          <StatBox label="Prev Close" value={formatPrice(quote.prevClose)} />
        </motion.div>
      )}

      {/* Chart */}
      <GlassCard className="min-h-[520px] flex flex-col p-0" delay={0.15}>
        <CandlestickChart
          candles={candles}
          quote={quote}
          signal={signal}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          loading={loading}
        />
      </GlassCard>

      {/* Indicators */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Technical Indicators</h2>
        <IndicatorPanel signal={signal} />
      </div>
    </div>
  )
}

export default LiveCharts
