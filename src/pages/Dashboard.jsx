import { useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Activity, Wifi, Clock } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useMarketData } from '../hooks/useMarketData'
import IndexCard from '../components/market/IndexCard'
import TopMovers from '../components/market/TopMovers'
import SignalCard from '../components/signals/SignalCard'
import CandlestickChart from '../components/charts/CandlestickChart'
import Watchlist from '../components/watchlist/Watchlist'
import IndicatorPanel from '../components/indicators/IndicatorPanel'
import GlassCard from '../components/ui/GlassCard'
import Badge from '../components/ui/Badge'

const INDICES = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'VIX']

const Dashboard = () => {
  const { quotes, topMovers, isLoading, lastUpdated, usingMock, selectedSymbol, setSelectedSymbol, selectedTimeframe, setSelectedTimeframe } = useApp()
  const { candles, quote, signal, loading: chartLoading } = useMarketData(selectedSymbol, selectedTimeframe)

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-white">Market Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5 font-mono flex items-center gap-1.5">
            <Clock size={10} />
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Fetching data...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {usingMock && (
            <Badge variant="hold" size="sm" pulse>Demo Mode</Badge>
          )}
          <Badge variant={signal?.type === 'BUY' ? 'bull' : signal?.type === 'SELL' ? 'bear' : 'neutral'} size="sm">
            {selectedSymbol} · {signal?.type || 'ANALYZING'}
          </Badge>
        </div>
      </motion.div>

      {/* Index Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {INDICES.map((sym, i) => (
          <IndexCard
            key={sym}
            symbol={sym}
            data={quotes[sym]}
            loading={isLoading && !quotes[sym]}
            delay={i * 0.05}
            isSelected={selectedSymbol === sym}
            onClick={sym !== 'VIX' && sym !== 'SENSEX' ? () => setSelectedSymbol(sym) : undefined}
          />
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Chart — takes 3 columns */}
        <GlassCard className="xl:col-span-3 min-h-[480px] flex flex-col p-0" delay={0.1}>
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity size={16} className="text-primary-400" />
              <div>
                <div className="text-sm font-semibold text-white">{selectedSymbol} Price Chart</div>
                <div className="text-[10px] text-gray-500 font-mono">{selectedTimeframe} • Candlestick</div>
              </div>
            </div>
            {quote && (
              <div className="flex items-center gap-3 text-right">
                <div>
                  <div className="text-xs text-gray-500">Vol</div>
                  <div className="text-xs font-mono text-gray-300">
                    {quote.volume ? (quote.volume / 1e5).toFixed(1) + 'L' : '--'}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1">
            <CandlestickChart
              candles={candles}
              quote={quote}
              signal={signal}
              timeframe={selectedTimeframe}
              onTimeframeChange={setSelectedTimeframe}
              loading={chartLoading}
            />
          </div>
        </GlassCard>

        {/* Right sidebar */}
        <div className="space-y-4">
          <SignalCard signal={signal} symbol={selectedSymbol} delay={0.15} />
          <Watchlist onSelectSymbol={(sym) => setSelectedSymbol(sym)} />
        </div>
      </div>

      {/* Technical Indicators */}
      <div>
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3"
        >
          Technical Indicators
        </motion.h2>
        <IndicatorPanel signal={signal} />
      </div>

      {/* Top Movers */}
      <div>
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3"
        >
          Today&apos;s Movers
        </motion.h2>
        <TopMovers data={topMovers} loading={isLoading} delay={0.3} />
      </div>
    </div>
  )
}

export default Dashboard
