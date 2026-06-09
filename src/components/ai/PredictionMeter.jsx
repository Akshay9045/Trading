import { motion } from 'framer-motion'
import { Brain, TrendingUp, TrendingDown, Minus, Activity, Zap } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import Badge from '../ui/Badge'

const ProbabilityBar = ({ label, value, color, icon: Icon, delay }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay }}
    className="space-y-2"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={14} className={color} />
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <span className={`text-lg font-black font-mono ${color}`}>{value}%</span>
    </div>
    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color.replace('text-', 'var(--tw-') }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 1.2, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      />
    </div>
  </motion.div>
)

const CircularScore = ({ value, label, size = 80 }) => {
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const color = value > 65 ? '#00d4a1' : value < 35 ? '#ff4d6d' : '#f59e0b'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <motion.circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-black font-mono" style={{ color }}>{value}</span>
        </div>
      </div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide text-center">{label}</span>
    </div>
  )
}

const FearGreedMeter = ({ value, label }) => {
  const segments = [
    { label: 'Extreme Fear', range: [0, 25], color: '#ff4d6d' },
    { label: 'Fear', range: [25, 45], color: '#f97316' },
    { label: 'Neutral', range: [45, 55], color: '#f59e0b' },
    { label: 'Greed', range: [55, 75], color: '#84cc16' },
    { label: 'Extreme Greed', range: [75, 100], color: '#00d4a1' },
  ]
  const current = segments.find(s => value >= s.range[0] && value <= s.range[1])
  const angle = (value / 100) * 180 - 90
  const r = 55
  const cx = 80, cy = 75

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-primary-400" />
        <h3 className="font-semibold text-sm text-gray-300">Fear & Greed Index</h3>
      </div>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 160 90" className="w-48">
          <defs>
            <linearGradient id="feargreed" x1="0" x2="1" y1="0" y2="0">
              {segments.map((s, i) => (
                <stop key={i} offset={`${s.range[0]}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          {/* Background arc */}
          <path d="M 16 75 A 64 64 0 0 1 144 75" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" />
          {/* Colored arc */}
          <path d="M 16 75 A 64 64 0 0 1 144 75" fill="none" stroke="url(#feargreed)" strokeWidth="10" strokeLinecap="round" opacity="0.8" />
          {/* Needle */}
          <motion.line
            x1={cx} y1={cy}
            x2={cx + 50 * Math.cos((angle * Math.PI) / 180)}
            y2={cy + 50 * Math.sin((angle * Math.PI) / 180)}
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ rotate: -90 }}
            animate={{ rotate: angle - 90 }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
          <circle cx={cx} cy={cy} r="5" fill="white" />
          <text x={cx} y={cy + 18} textAnchor="middle" fill="white" fontSize="16" fontWeight="800" fontFamily="JetBrains Mono">
            {value}
          </text>
        </svg>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-2 h-2 rounded-full" style={{ background: current?.color }} />
          <span className="font-semibold text-sm" style={{ color: current?.color }}>{label}</span>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap justify-center">
          {segments.map(s => (
            <div key={s.label} className={`flex items-center gap-1 text-[10px] opacity-60 ${value >= s.range[0] && value <= s.range[1] ? 'opacity-100' : ''}`}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-400">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}

const PredictionMeter = ({ prediction, signal, delay = 0 }) => {
  if (!prediction) return null

  return (
    <div className="space-y-4">
      {/* Main probability */}
      <GlassCard delay={delay} className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-primary-500/15 border border-primary-500/25 flex items-center justify-center">
            <Brain size={16} className="text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-gray-200">AI Market Prediction</h3>
            <p className="text-[10px] text-gray-500">Based on technical analysis & momentum</p>
          </div>
          <Badge variant={prediction.bullishProbability > 50 ? 'bull' : 'bear'} size="sm" pulse className="ml-auto">
            {prediction.marketSentiment}
          </Badge>
        </div>

        <div className="space-y-4 mb-5">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <div className="flex items-center gap-1.5 text-bull"><TrendingUp size={12} /> Bullish</div>
              <span className="text-bull font-mono font-bold">{prediction.bullishProbability}%</span>
            </div>
            <div className="h-3 bg-white/[0.05] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-bull/70 to-bull rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${prediction.bullishProbability}%` }}
                transition={{ duration: 1.2, delay: delay + 0.2, ease: 'easeOut' }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <div className="flex items-center gap-1.5 text-bear"><TrendingDown size={12} /> Bearish</div>
              <span className="text-bear font-mono font-bold">{prediction.bearishProbability}%</span>
            </div>
            <div className="h-3 bg-white/[0.05] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-bear/70 to-bear rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${prediction.bearishProbability}%` }}
                transition={{ duration: 1.2, delay: delay + 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        {/* Score circles */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/[0.05]">
          <CircularScore value={prediction.bullishProbability} label="Bull Score" />
          <CircularScore value={prediction.fearGreedIndex} label="Greed Index" />
          <CircularScore value={signal?.confidence || 0} label="Confidence" />
        </div>
      </GlassCard>

      <FearGreedMeter value={prediction.fearGreedIndex} label={prediction.fearGreedLabel} />

      {/* Market outlook */}
      <GlassCard delay={delay + 0.1} className="p-5">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Market Intelligence</h4>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Short-term Outlook', value: prediction.shortTermOutlook },
            { label: 'Trend Strength', value: prediction.trendStrength },
            { label: 'Market Sentiment', value: prediction.marketSentiment },
            { label: 'Volume Analysis', value: prediction.volumeAnalysis },
          ].map(item => (
            <div key={item.label} className="bg-white/[0.03] rounded-xl p-3">
              <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{item.label}</div>
              <div className={`text-sm font-semibold
                ${item.value === 'Bullish' || item.value === 'Positive' || item.value === 'Strong' ? 'text-bull' :
                  item.value === 'Bearish' || item.value === 'Negative' ? 'text-bear' : 'text-gray-300'}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

export default PredictionMeter
