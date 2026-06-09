import { motion } from 'framer-motion'
import GlassCard from '../ui/GlassCard'
import Badge from '../ui/Badge'

const GaugeArc = ({ value, min = 0, max = 100, color }) => {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = pct * 180 - 90
  const r = 40
  const cx = 60, cy = 55
  const startAngle = -180
  const arcPath = (start, end) => {
    const toRad = d => (d * Math.PI) / 180
    const x1 = cx + r * Math.cos(toRad(start))
    const y1 = cy + r * Math.sin(toRad(start))
    const x2 = cx + r * Math.cos(toRad(end))
    const y2 = cy + r * Math.sin(toRad(end))
    return `M ${x1} ${y1} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2}`
  }

  return (
    <svg viewBox="0 0 120 65" className="w-full">
      <path d={arcPath(-180, 0)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
      <path d={arcPath(-180, startAngle + pct * 180)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
      <line
        x1={cx} y1={cy}
        x2={cx + 32 * Math.cos((angle * Math.PI) / 180)}
        y2={cy + 32 * Math.sin((angle * Math.PI) / 180)}
        stroke="white" strokeWidth="1.5" strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="3" fill="white" />
    </svg>
  )
}

const RSICard = ({ value, delay }) => {
  const signal = value < 30 ? 'Oversold' : value > 70 ? 'Overbought' : 'Neutral'
  const variant = value < 30 ? 'bull' : value > 70 ? 'bear' : 'neutral'
  const color = value < 30 ? '#00d4a1' : value > 70 ? '#ff4d6d' : '#f59e0b'

  return (
    <GlassCard delay={delay} className="p-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">RSI (14)</div>
          <div className="text-2xl font-black font-mono" style={{ color }}>{value?.toFixed(1) || '--'}</div>
        </div>
        <Badge variant={variant} size="sm">{signal}</Badge>
      </div>
      <GaugeArc value={value || 50} color={color} />
      <div className="flex justify-between text-[10px] font-mono text-gray-600 -mt-2">
        <span>0 Oversold</span>
        <span>70-100 Overbought</span>
      </div>
    </GlassCard>
  )
}

const MACDCard = ({ macd, signal: sig, histogram, delay }) => {
  const isBullish = histogram > 0
  const variant = isBullish ? 'bull' : 'bear'
  const color = isBullish ? '#00d4a1' : '#ff4d6d'

  return (
    <GlassCard delay={delay} className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">MACD (12,26,9)</div>
          <Badge variant={variant} size="sm" className="mt-1">
            {isBullish ? 'Bullish' : 'Bearish'} Momentum
          </Badge>
        </div>
      </div>
      <div className="space-y-2.5">
        {[
          { label: 'MACD Line', value: macd, color: '#0ea5e9' },
          { label: 'Signal Line', value: sig, color: '#f59e0b' },
          { label: 'Histogram', value: histogram, color },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
              <span className="text-xs text-gray-500">{item.label}</span>
            </div>
            <span className="text-sm font-mono font-semibold" style={{ color: item.color }}>
              {item.value?.toFixed(3) || '--'}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

const EMACard = ({ ema9, ema20, ema50, price, delay }) => {
  const allAbove = price > ema9 && ema9 > ema20 && ema20 > ema50
  const allBelow = price < ema9 && ema9 < ema20 && ema20 < ema50
  const variant = allAbove ? 'bull' : allBelow ? 'bear' : 'neutral'

  return (
    <GlassCard delay={delay} className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">EMA Levels</div>
        <Badge variant={variant} size="sm">
          {allAbove ? 'Bullish Trend' : allBelow ? 'Bearish Trend' : 'Mixed'}
        </Badge>
      </div>
      <div className="space-y-3">
        {[
          { label: 'Price', value: price, color: 'text-white' },
          { label: 'EMA 9', value: ema9, color: 'text-yellow-400', above: price > ema9 },
          { label: 'EMA 20', value: ema20, color: 'text-primary-400', above: price > ema20 },
          { label: 'EMA 50', value: ema50, color: 'text-purple-400', above: price > ema50 },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span className={`text-xs flex-1 ${item.color}`}>{item.label}</span>
            <span className={`text-sm font-mono font-semibold ${item.color}`}>
              {item.value?.toFixed(2) || '--'}
            </span>
            {item.above !== undefined && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded
                ${item.above ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                {item.above ? 'Above' : 'Below'}
              </span>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

const BollingerCard = ({ upper, lower, middle, price, delay }) => {
  const bandwidth = upper && lower ? upper - lower : 0
  const positionPct = bandwidth > 0 ? ((price - lower) / bandwidth) * 100 : 50
  const signal = positionPct > 80 ? 'Near Upper' : positionPct < 20 ? 'Near Lower' : 'Mid Band'
  const variant = positionPct < 20 ? 'bull' : positionPct > 80 ? 'bear' : 'neutral'

  return (
    <GlassCard delay={delay} className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Bollinger Bands (20,2)</div>
        <Badge variant={variant} size="sm">{signal}</Badge>
      </div>
      {/* Position indicator */}
      <div className="relative h-8 bg-white/[0.04] rounded-lg overflow-hidden mb-3">
        <div className="absolute left-0 top-0 bottom-0 w-1/4 bg-bull/10 rounded-l-lg" />
        <div className="absolute right-0 top-0 bottom-0 w-1/4 bg-bear/10 rounded-r-lg" />
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary-400 rounded-full shadow-lg"
          animate={{ left: `calc(${Math.min(97, Math.max(3, positionPct))}% - 6px)` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="space-y-2">
        {[
          { label: 'Upper Band', value: upper, color: 'text-bear/80' },
          { label: 'Middle Band', value: middle, color: 'text-gray-400' },
          { label: 'Lower Band', value: lower, color: 'text-bull/80' },
          { label: 'Band Width', value: bandwidth, color: 'text-gray-500' },
        ].map(item => (
          <div key={item.label} className="flex justify-between items-center">
            <span className="text-xs text-gray-600">{item.label}</span>
            <span className={`text-xs font-mono font-semibold ${item.color}`}>{item.value?.toFixed(2) || '--'}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

const IndicatorPanel = ({ signal, candles }) => {
  if (!signal) return null
  const { indicators, entry: price } = signal

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <RSICard value={indicators.rsi} delay={0} />
      <MACDCard macd={indicators.macd} signal={indicators.macdSignal} histogram={signal.macd - signal.macdSignal || 0} delay={0.05} />
      <EMACard ema9={indicators.ema9} ema20={indicators.ema20} ema50={indicators.ema50} price={price} delay={0.1} />
      <BollingerCard upper={indicators.bbUpper} lower={indicators.bbLower} middle={(indicators.bbUpper + indicators.bbLower) / 2} price={price} delay={0.15} />
    </div>
  )
}

export default IndicatorPanel
