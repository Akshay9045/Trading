import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { tradeApi } from '../services/tradeApi'

// Shared trading state: paper/live mode, Groww auth, risk limits, and the order
// ticket (opened from any page, rendered once in Layout).
const TradingContext = createContext(null)

export const TradingProvider = ({ children }) => {
  const [status, setStatus] = useState(null)       // /api/trade/status
  const [statusError, setStatusError] = useState(null)
  const [ticket, setTicket] = useState(null)       // prefill for the order ticket, or null

  const refreshStatus = useCallback(async () => {
    try { setStatus(await tradeApi.status()); setStatusError(null) }
    catch (e) { setStatusError(e.message) }
  }, [])

  useEffect(() => {
    refreshStatus()
    const id = setInterval(refreshStatus, 15000)
    return () => clearInterval(id)
  }, [refreshStatus])

  const setMode = useCallback(async (mode, confirm) => {
    const r = await tradeApi.setMode(mode, confirm)
    await refreshStatus()
    return r
  }, [refreshStatus])

  return (
    <TradingContext.Provider value={{
      status, statusError, refreshStatus, setMode,
      mode: status?.mode || 'paper',
      ticket, openTicket: setTicket, closeTicket: () => setTicket(null),
    }}>
      {children}
    </TradingContext.Provider>
  )
}

export const useTrading = () => {
  const ctx = useContext(TradingContext)
  if (!ctx) throw new Error('useTrading must be used inside TradingProvider')
  return ctx
}
