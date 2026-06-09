import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, BarChart3, Globe, Users, DollarSign } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import Badge from '../components/ui/Badge'

const generateSentimentData = () => ({
  advance: Math.floor(1200 + Math.random() * 800),
  decline: Math.floor(800 + Math.random() * 600),
  unchanged: Math.floor(100 + Math.random() * 100),
  newHigh52W: Math.floor(20 + Math.random() * 60),
  newLow52W: Math.floor(10 + Math.random() * 30),
  fiiNet: parseFloat(((Math.random() - 0.4) * 3000).toFixed(0)),
  diiNet: parseFloat(((Math.random() - 0.4) * 2000).toFixed(0)),
  putCallRatio: parseFloat((0.8 + Math.random() * 0.6).toFixed(2)),
  openInterestChange: parseFloat(((Math.random() - 0.5) * 10).toFixed(2)),
  vixChange: parseFloat(((Math.random() - 0.5) * 2).toFixed(2)),
  sectors: [
    { name: 'IT', change: parseFloat(((Math.random() - 0.4) * 3).toFixed(2)) },
    { name: 'Banking', change: parseFloat(((Math.random() - 0.4) * 2).toFixed(2)) },
    { name: 'FMCG', change: parseFloat(((Math.random() - 0.5) * 1.5).toFixed(2)) },
    { name: 'Pharma', change: parseFloat(((Math.random() - 0.4) * 2.5).toFixed(2)) },
    { name: 'Auto', change: parseFloat(((Math.random() - 0.5) * 3).toFixed(2)) },
    { name: 'Metal', change: parseFloat(((Math.random() - 0.5) * 4).toFixed(2)) },
    { name: 'Energy', change: parseFloat(((Math.random() - 0.4) * 2).toFixed(2)) },
    { name: 'Infra', change: parseFloat(((Math.random() - 0.5) * 2.5).toFixed(2)) },
  ],
})

const MarketBreadth = ({ advance, decline, unchanged, delay }) => {
  const total = advance + decline + unchanged
  const bullPct = (advance / total) * 100
  const bearPct = (decline / total) * 100
  const neuPct = (unchanged / total) * 100

  return (
    <GlassCard delay={delay} className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-primary-400" />
        <h3 className="font-semibold text-sm text-gray-200">Market Breadth</h3>
        <Badge variant={bullPct > bearPct ? 'bull' : 'bear'} size="sm" className="ml-auto">
          {bullPct > bearPct ? 'Positive' : 'Negative'}
        </Badge>
      </div>

      <div className="flex h-4 rounded-full overflow-hidden mb-4 gap-0.5">
        <motion.div className="bg-bull rounded-l-full" animate={{ width: `${bullPct}%` }} transition={{ duration: 1 }} />
        <motion.div className="bg-gray-600" animate={{ width: `${neuPct}%` }} transition={{ duration: 1 }} />
        <motion.div className="bg-bear rounded-r-full" animate={{ width: `${bearPct}%` }} transition={{ duration: 1 }} />
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Advancing', value: advance, color: 'text-bull' },
          { label: 'Unchanged', value: unchanged, color: 'text-gray-400' },
          { label: 'Declining', value: decline, color: 'text-bear' },
        ].map(item => (
          <div key={item.label}>
            <div className={`text-xl font-black font-mono ${item.color}`}>{item.value.toLocaleString()}</div>
            <div className="text-[10px] text-gray-600">{item.label}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

const FIIDIICard = ({ fiiNet, diiNet, delay }) => (
  <GlassCard delay={delay} className="p-5">
    <div className="flex items-center gap-2 mb-4">
      <Globe size={16} className="text-primary-400" />
      <h3 className="font-semibold text-sm text-gray-200">FII / DII Activity</h3>
    </div>
    <div className="space-y-4">
      {[
        { label: 'FII Net (₹ Cr)', value: fiiNet, icon: Globe },
        { label: 'DII Net (₹ Cr)', value: diiNet, icon: Users },
      ].map(item => {
        const isPos = item.value >= 0
        return (
          <div key={item.label}>
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <item.icon size={12} />
                {item.label}
              </div>
              <span className={`text-base font-black font-mono ${isPos ? 'text-bull' : 'text-bear'}`}>
                {isPos ? '+' : ''}{item.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${isPos ? 'bg-bull' : 'bg-bear'}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.abs(item.value) / 50)}%` }}
                transition={{ duration: 1 }}
              />
            </div>
          </div>
        )
      })}
    </div>
    <div className="mt-4 pt-3 border-t border-white/[0.05] text-[10px] text-gray-600">
      * Provisional data, subject to revision
    </div>
  </GlassCard>
)

const SectorHeatmap = ({ sectors, delay }) => (
  <GlassCard delay={delay} className="p-5">
    <div className="flex items-center gap-2 mb-4">
      <BarChart3 size={16} className="text-primary-400" />
      <h3 className="font-semibold text-sm text-gray-200">Sector Performance</h3>
    </div>
    <div className="grid grid-cols-4 gap-2">
      {sectors.map((sector, i) => {
        const isPos = sector.change >= 0
        const intensity = Math.min(0.9, Math.abs(sector.change) / 5)
        return (
          <motion.div
            key={sector.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + i * 0.05 }}
            className="rounded-xl p-3 flex flex-col items-center justify-center aspect-square border border-white/[0.05] cursor-pointer hover:scale-105 transition-transform"
            style={{
              background: isPos
                ? `rgba(0, 212, 161, ${intensity * 0.25})`
                : `rgba(255, 77, 109, ${intensity * 0.25})`
            }}
          >
            <div className="text-[10px] font-semibold text-gray-300">{sector.name}</div>
            <div className={`text-sm font-black font-mono mt-1 ${isPos ? 'text-bull' : 'text-bear'}`}>
              {isPos ? '+' : ''}{sector.change}%
            </div>
          </motion.div>
        )
      })}
    </div>
  </GlassCard>
)

const OptionsCard = ({ pcr, oiChange, delay }) => {
  const pcrBull = pcr < 0.8
  const pcrBear = pcr > 1.2

  return (
    <GlassCard delay={delay} className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign size={16} className="text-primary-400" />
        <h3 className="font-semibold text-sm text-gray-200">Options Data</h3>
      </div>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-500">Put-Call Ratio</span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-black font-mono text-white">{pcr}</span>
              <Badge variant={pcrBull ? 'bull' : pcrBear ? 'bear' : 'neutral'} size="sm">
                {pcrBull ? 'Bullish' : pcrBear ? 'Bearish' : 'Neutral'}
              </Badge>
            </div>
          </div>
          <div className="text-[10px] text-gray-600">
            PCR &lt; 0.8 = Bullish sentiment | PCR &gt; 1.2 = Bearish sentiment
          </div>
        </div>
        <div className="h-px bg-white/[0.05]" />
        <div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">OI Change</span>
            <span className={`text-base font-black font-mono ${oiChange >= 0 ? 'text-bull' : 'text-bear'}`}>
              {oiChange >= 0 ? '+' : ''}{oiChange}%
            </span>
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">Total Open Interest change</div>
        </div>
      </div>
    </GlassCard>
  )
}

const Sentiment = () => {
  const [data, setData] = useState(generateSentimentData)

  useEffect(() => {
    const interval = setInterval(() => setData(generateSentimentData()), 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Market Sentiment</h1>
          <p className="text-xs text-gray-500 mt-0.5">Real-time market mood and participant activity</p>
        </div>
        <Badge variant={data.advance > data.decline ? 'bull' : 'bear'} size="sm" pulse>
          {data.advance > data.decline ? 'Risk On' : 'Risk Off'}
        </Badge>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MarketBreadth advance={data.advance} decline={data.decline} unchanged={data.unchanged} delay={0} />
        <FIIDIICard fiiNet={data.fiiNet} diiNet={data.diiNet} delay={0.05} />
        <OptionsCard pcr={data.putCallRatio} oiChange={data.openInterestChange} delay={0.1} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: '52W High', value: data.newHigh52W, icon: TrendingUp, color: 'text-bull', sub: 'Stocks at new high' },
          { label: '52W Low', value: data.newLow52W, icon: TrendingDown, color: 'text-bear', sub: 'Stocks at new low' },
          { label: 'VIX Δ', value: `${data.vixChange > 0 ? '+' : ''}${data.vixChange}`, icon: BarChart3, color: data.vixChange > 0 ? 'text-bear' : 'text-bull', sub: 'India VIX change' },
        ].map((item, i) => (
          <GlassCard key={item.label} delay={0.15 + i * 0.05} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                <div className={`text-3xl font-black font-mono ${item.color}`}>{item.value}</div>
                <div className="text-[10px] text-gray-600 mt-1">{item.sub}</div>
              </div>
              <item.icon size={28} className={`${item.color} opacity-20`} />
            </div>
          </GlassCard>
        ))}
      </div>

      <SectorHeatmap sectors={data.sectors} delay={0.2} />
    </div>
  )
}

export default Sentiment
