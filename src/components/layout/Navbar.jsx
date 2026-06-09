import { motion } from 'framer-motion'
import { Menu, RefreshCw, Sun, Moon, Bell, Search, TrendingUp, TrendingDown } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { formatPrice, formatPercent } from '../../utils/formatters'
import AnimatedCounter from '../ui/AnimatedCounter'

const TICKER_ITEMS = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'VIX']

const TickerItem = ({ symbol, data }) => {
  if (!data) return null
  const isPositive = data.changePercent >= 0
  return (
    <span className="inline-flex items-center gap-2 px-5 whitespace-nowrap">
      <span className="text-gray-500 text-xs font-mono">{symbol}</span>
      <span className="text-white text-sm font-mono font-semibold">
        {formatPrice(data.price)}
      </span>
      <span className={`flex items-center gap-0.5 text-xs font-mono ${isPositive ? 'text-bull' : 'text-bear'}`}>
        {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {formatPercent(data.changePercent)}
      </span>
    </span>
  )
}

const Navbar = ({ onMenuClick }) => {
  const { quotes, theme, toggleTheme, refreshMarketData, usingMock } = useApp()

  const tickerContent = TICKER_ITEMS.map(s => (
    <TickerItem key={s} symbol={s} data={quotes[s]} />
  ))

  return (
    <header className="fixed top-0 left-0 right-0 z-30 lg:left-64">
      <div className="h-14 bg-dark-200/90 backdrop-blur-xl border-b border-white/[0.06] flex items-center gap-3 px-4">
        {/* Mobile menu */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all"
        >
          <Menu size={20} />
        </button>

        {/* Live ticker */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-dark-200/90 to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-dark-200/90 to-transparent z-10" />
          <div className="flex animate-ticker" style={{ width: 'max-content' }}>
            <div className="flex">{tickerContent}</div>
            <div className="flex">{tickerContent}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {usingMock && (
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-hold/10 border border-hold/20 text-hold text-[10px] font-mono font-medium">
              <span className="w-1.5 h-1.5 bg-hold rounded-full animate-pulse" />
              DEMO
            </span>
          )}

          <button
            onClick={refreshMarketData}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all"
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all relative">
            <Bell size={16} />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-bear rounded-full" />
          </button>

          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white ml-1">
            A
          </div>
        </div>
      </div>
    </header>
  )
}

export default Navbar
