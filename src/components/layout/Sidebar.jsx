import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, BarChart2, Activity, Zap, Brain, TrendingUp,
  Eye, ChevronRight, X, Wifi, Layers
} from 'lucide-react'
import { useApp } from '../../context/AppContext'

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', desc: 'Market overview' },
  { path: '/charts', icon: BarChart2, label: 'Live Charts', desc: 'Interactive charts' },
  { path: '/indicators', icon: Activity, label: 'Indicators', desc: 'Technical analysis' },
  { path: '/signals', icon: Zap, label: 'Signals', desc: 'Trade signals' },
  { path: '/options', icon: Layers, label: 'Options Signals', desc: 'CALL / PUT signals', highlight: true },
  { path: '/ai', icon: Brain, label: 'AI Predictions', desc: 'ML insights' },
  { path: '/sentiment', icon: TrendingUp, label: 'Sentiment', desc: 'Market mood' },
  { path: '/watchlist', icon: Eye, label: 'Watchlist', desc: 'Track stocks' },
]

const Sidebar = ({ isOpen, onClose }) => {
  const { usingMock, lastUpdated } = useApp()

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 z-50
        bg-dark-200/95 backdrop-blur-xl border-r border-white/[0.06]
        flex flex-col transition-transform duration-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-glow">
              <TrendingUp size={18} className="text-white" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-bull rounded-full border-2 border-dark-200 animate-pulse" />
            </div>
            <div>
              <div className="font-bold text-white text-sm tracking-wide">NIFTY</div>
              <div className="text-[10px] text-primary-400 font-mono uppercase tracking-widest">Terminal</div>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600 mb-1">
            Navigation
          </div>
          {NAV_ITEMS.map(({ path, icon: Icon, label, desc, highlight }) => (
            <NavLink
              key={path}
              to={path}
              onClick={onClose}
              className={({ isActive }) => `
                group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative
                ${isActive
                  ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                  : highlight
                    ? 'text-bull hover:bg-bull/[0.06] border border-bull/15 hover:border-bull/30'
                    : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent'
                }
              `}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary-400 rounded-full"
                    />
                  )}
                  <Icon size={17} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{label}</div>
                    <div className="text-[10px] opacity-60 truncate">{desc}</div>
                  </div>
                  {highlight && !isActive && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-bull/15 text-bull border border-bull/20">
                      NEW
                    </span>
                  )}
                  {!highlight && (
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-white/[0.06] space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03]">
            <Wifi size={12} className={usingMock ? 'text-hold' : 'text-bull'} />
            <span className="text-[10px] text-gray-500">
              {usingMock ? 'Demo Mode' : 'Live Data'}
            </span>
            <span className="ml-auto text-[9px] text-gray-600">
              {lastUpdated ? lastUpdated.toLocaleTimeString() : '--'}
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
