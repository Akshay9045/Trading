import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Activity, BarChart2, Waves, TrendingUp } from 'lucide-react'
import { useMarketData } from '../hooks/useMarketData'
import { calculateRSI, calculateMACD, calculateEMA, calculateBollingerBands, calculateStochRSI } from '../utils/indicators'
import GlassCard from '../components/ui/GlassCard'
import Badge from '../components/ui/Badge'
import IndicatorPanel from '../components/indicators/IndicatorPanel'

const ProgressBar = ({ value, max = 100, color, label, sublabel }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">{label}</span>
        <div className="flex items-center gap-2">
          {sublabel && <span className="text-[10px] text-gray-600">{sublabel}</span>}
          <span className={`text-sm font-mono font-bold ${color}`}>{value?.toFixed(2)}</span>
        </div>
      </div>
      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color.replace('text-', 'bg-')}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

const HistogramBar = ({ value, maxVal = 1 }) => {
  const pct = (Math.abs(value) / maxVal) * 50
  const isPos = value >= 0
  return (
    <div className="flex items-center h-4">
      <div className="flex-1 flex justify-end">
        {!isPos && (
          <div className="h-2 rounded-l-sm" style={{ width: `${pct}%`, background: '#ff4d6d' }} />
        )}
      </div>
      <div className="w-px h-4 bg-white/10 flex-shrink-0" />
      <div className="flex-1">
        {isPos && (
          <div className="h-2 rounded-r-sm" style={{ width: `${pct}%`, background: '#00d4a1' }} />
        )}
      </div>
    </div>
  )
}

const Indicators = () => {
  const [symbol, setSymbol] = useState('NIFTY')
  const { candles, signal, loading } = useMarketData(symbol, '1D')
  const [indicators, setIndicators] = useState(null)

  useEffect(() => {
    if (!candles.length) return
    const closes = candles.map(c => c.close)
    const rsiData = calculateRSI(closes)
    const macdData = calculateMACD(closes)
    const ema9Data = calculateEMA(closes, 9)
    const ema20Data = calculateEMA(closes, 20)
    const ema50Data = calculateEMA(closes, 50)
    const ema200Data = calculateEMA(closes, 200)
    const bbData = calculateBollingerBands(closes)
    const stochData = calculateStochRSI(closes)
    const last = closes.length - 1

    const recent = (arr) => arr.slice(Math.max(0, last - 19), last + 1).filter(v => v !== null)
    const macdRecent = recent(macdData.histogram)
    const maxMacd = Math.max(...macdRecent.map(Math.abs), 0.01)

    setIndicators({
      rsi: rsiData[last],
      rsiHistory: recent(rsiData),
      macd: macdData.macd[last],
      macdSignal: macdData.signal[last],
      histogram: macdData.histogram[last],
      histogramHistory: macdRecent,
      maxMacd,
      ema9: ema9Data[last],
      ema20: ema20Data[last],
      ema50: ema50Data[last],
      ema200: ema200Data[last],
      bbUpper: bbData.upper[last],
      bbMiddle: bbData.middle[last],
      bbLower: bbData.lower[last],
      stochRSI: stochData[last],
      price: closes[last],
    })
  }, [candles])

  const getRSIColor = (v) => v < 30 ? 'text-bull' : v > 70 ? 'text-bear' : 'text-hold'

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Technical Indicators</h1>
          <p className="text-xs text-gray-500 mt-0.5">Deep-dive analysis for {symbol}</p>
        </div>
      </motion.div>

      {/* Quick Indicator Summary */}
      <IndicatorPanel signal={signal} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RSI Deep Dive */}
        <GlassCard className="p-5" delay={0.1}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-primary-400" />
              <h3 className="font-semibold text-sm text-gray-200">Relative Strength Index</h3>
            </div>
            {indicators?.rsi && (
              <Badge variant={indicators.rsi < 30 ? 'bull' : indicators.rsi > 70 ? 'bear' : 'hold'} size="sm">
                {indicators.rsi < 30 ? 'Oversold' : indicators.rsi > 70 ? 'Overbought' : 'Neutral'}
              </Badge>
            )}
          </div>

          <div className="flex items-end gap-1 h-20 mb-3">
            {indicators?.rsiHistory?.map((v, i) => {
              const height = (v / 100) * 100
              const color = v < 30 ? '#00d4a1' : v > 70 ? '#ff4d6d' : '#f59e0b'
              return (
                <motion.div
                  key={i}
                  className="flex-1 rounded-sm opacity-70"
                  style={{ background: color, height: `${height}%` }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: i * 0.02 }}
                />
              )
            })}
          </div>

          <div className="space-y-2">
            <ProgressBar value={indicators?.rsi || 50} label="RSI (14)" color={getRSIColor(indicators?.rsi || 50)} />
            <ProgressBar value={indicators?.stochRSI || 50} label="Stoch RSI" color={getRSIColor(indicators?.stochRSI || 50)} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px]">
            {[['0-30', 'Oversold', '#00d4a1'], ['30-70', 'Neutral', '#f59e0b'], ['70-100', 'Overbought', '#ff4d6d']].map(([range, label, color]) => (
              <div key={range} className="bg-white/[0.03] rounded-lg p-2">
                <div className="font-mono font-bold" style={{ color }}>{range}</div>
                <div className="text-gray-600">{label}</div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* MACD Deep Dive */}
        <GlassCard className="p-5" delay={0.15}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Waves size={16} className="text-primary-400" />
              <h3 className="font-semibold text-sm text-gray-200">MACD (12, 26, 9)</h3>
            </div>
            {indicators?.histogram !== null && indicators?.histogram !== undefined && (
              <Badge variant={indicators.histogram > 0 ? 'bull' : 'bear'} size="sm">
                {indicators.histogram > 0 ? 'Bullish' : 'Bearish'}
              </Badge>
            )}
          </div>

          {/* Histogram bars */}
          <div className="space-y-1 mb-4">
            <div className="text-[10px] text-gray-600 mb-2">Histogram (last 20 bars)</div>
            <div className="space-y-0.5">
              {indicators?.histogramHistory?.map((v, i) => (
                <HistogramBar key={i} value={v} maxVal={indicators.maxMacd} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {[
              { label: 'MACD Line', value: indicators?.macd, color: 'text-primary-400' },
              { label: 'Signal Line', value: indicators?.macdSignal, color: 'text-yellow-400' },
              { label: 'Histogram', value: indicators?.histogram, color: indicators?.histogram > 0 ? 'text-bull' : 'text-bear' },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-white/[0.04] last:border-0">
                <span className="text-xs text-gray-500">{item.label}</span>
                <span className={`text-sm font-mono font-bold ${item.color}`}>
                  {item.value?.toFixed(3) || '--'}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* EMA Analysis */}
        <GlassCard className="p-5" delay={0.2}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-primary-400" />
              <h3 className="font-semibold text-sm text-gray-200">Moving Averages</h3>
            </div>
          </div>

          <div className="space-y-2.5">
            {[
              { label: 'EMA 9 (Short)', value: indicators?.ema9, color: '#f59e0b' },
              { label: 'EMA 20 (Medium)', value: indicators?.ema20, color: '#0ea5e9' },
              { label: 'EMA 50 (Long)', value: indicators?.ema50, color: '#a855f7' },
              { label: 'EMA 200 (Trend)', value: indicators?.ema200, color: '#06b6d4' },
            ].map(item => {
              const diff = indicators?.price && item.value ? ((indicators.price - item.value) / item.value * 100) : 0
              return (
                <div key={item.label} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                  <span className="text-xs text-gray-400 flex-1">{item.label}</span>
                  <span className="text-sm font-mono font-semibold text-white">{item.value?.toFixed(2) || '--'}</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full
                    ${diff > 0 ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(2)}%
                  </span>
                </div>
              )
            })}
          </div>
        </GlassCard>

        {/* Bollinger Bands */}
        <GlassCard className="p-5" delay={0.25}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-primary-400" />
              <h3 className="font-semibold text-sm text-gray-200">Bollinger Bands</h3>
            </div>
          </div>

          {indicators && (
            <div className="space-y-4">
              {/* Visual band display */}
              <div className="relative h-16 bg-white/[0.03] rounded-xl overflow-hidden border border-white/[0.05]">
                <div className="absolute top-0 left-0 right-0 h-2 bg-bear/20" />
                <div className="absolute bottom-0 left-0 right-0 h-2 bg-bull/20" />
                {/* Price position */}
                {indicators.bbUpper && indicators.bbLower && (
                  <motion.div
                    className="absolute w-3 h-3 bg-primary-400 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg"
                    style={{ top: '50%' }}
                    animate={{
                      left: `${((indicators.price - indicators.bbLower) / (indicators.bbUpper - indicators.bbLower)) * 100}%`
                    }}
                    transition={{ duration: 0.5 }}
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] text-gray-600 pointer-events-none">
                  <span>Lower</span>
                  <span>Middle</span>
                  <span>Upper</span>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { label: 'Upper Band', value: indicators.bbUpper, color: 'text-bear/70' },
                  { label: 'Middle Band (SMA20)', value: indicators.bbMiddle, color: 'text-gray-400' },
                  { label: 'Lower Band', value: indicators.bbLower, color: 'text-bull/70' },
                  { label: 'Band Width', value: indicators.bbUpper - indicators.bbLower, color: 'text-primary-400' },
                ].map(item => (
                  <div key={item.label} className="flex justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="text-xs text-gray-500">{item.label}</span>
                    <span className={`text-sm font-mono font-semibold ${item.color}`}>
                      {item.value?.toFixed(2) || '--'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}

export default Indicators
