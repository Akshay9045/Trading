import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchMultipleQuotes, fetchTopMovers } from '../services/apiService'

const AppContext = createContext(null)

const MARKET_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'VIX']
const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL) || 30000

export const AppProvider = ({ children }) => {
  const [quotes, setQuotes] = useState({})
  const [topMovers, setTopMovers] = useState({ gainers: [], losers: [] })
  const [signalHistory, setSignalHistory] = useState([])
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY')
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D')
  const [watchlist, setWatchlist] = useState(['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK'])
  const [theme, setTheme] = useState('dark')
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const refreshMarketData = useCallback(async () => {
    try {
      const [quotesData, movers] = await Promise.all([
        fetchMultipleQuotes(MARKET_SYMBOLS),
        fetchTopMovers(),
      ])
      setQuotes(quotesData)
      setTopMovers(movers)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Market data refresh failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshMarketData()
    const interval = setInterval(refreshMarketData, REFRESH_MS)
    return () => clearInterval(interval)
  }, [refreshMarketData])

  const addToWatchlist = (symbol) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist(prev => [...prev, symbol])
    }
  }

  const removeFromWatchlist = (symbol) => {
    setWatchlist(prev => prev.filter(s => s !== symbol))
  }

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  return (
    <AppContext.Provider value={{
      quotes,
      topMovers,
      signalHistory,   // empty — real history needs a backend database
      selectedSymbol, setSelectedSymbol,
      selectedTimeframe, setSelectedTimeframe,
      watchlist,
      addToWatchlist, removeFromWatchlist,
      theme, toggleTheme,
      isLoading,
      lastUpdated,
      refreshMarketData,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
