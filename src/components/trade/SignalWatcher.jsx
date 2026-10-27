import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useMarketData, useRealtimeQuote, useExpiries } from '../../hooks/useMarketData'
import { buildOptionsSignal } from '../../services/optionsEngine'
import { useTrading } from '../../context/TradingContext'

// Buy alerts: watches the options signal for each index in the background (on any
// page) and alerts once per new BUY CALL / BUY PUT setup — sound, toast with a
// "Review order" button, and a desktop notification. It never places an order.
const SYMBOLS = ['NIFTY', 'BANKNIFTY']
const SETTING_KEY = 'trade.signalAlerts'
const CANDLE_REFRESH_MS = 5 * 60_000

const readSetting = () => { try { return localStorage.getItem(SETTING_KEY) !== 'off' } catch { return true } }

export const useSignalAlertsSetting = () => {
  const [on, setOn] = useState(readSetting)
  useEffect(() => {
    const sync = () => setOn(readSetting())
    window.addEventListener('signal-alerts-changed', sync)
    return () => window.removeEventListener('signal-alerts-changed', sync)
  }, [])
  const set = useCallback((v) => {
    try { localStorage.setItem(SETTING_KEY, v ? 'on' : 'off') } catch { /* private mode */ }
    window.dispatchEvent(new Event('signal-alerts-changed'))
  }, [])
  return [on, set]
}

const beep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = i ? 1046 : 784
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.17)
    })
  } catch { /* audio blocked until the user interacts with the page */ }
}

// Prefill for the order ticket from an options signal
export const ticketFromSignal = (s) => ({
  underlying:   s.symbol,
  strike:       s.atmStrike,
  optionType:   s.optionType === 'CALL' ? 'CE' : 'PE',
  slOffset:     Math.max(0.05, s.atmPremium - s.premiumSL),
  targetOffset: Math.max(0.05, s.premiumTarget - s.atmPremium),
  suggestedLots: 1,
})

const isMarketHours = () => {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000)
  const m = d.getUTCHours() * 60 + d.getUTCMinutes()
  return d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && m >= 9 * 60 + 15 && m <= 15 * 60 + 30
}

const Watch = ({ symbol, enabled }) => {
  const { openTicket } = useTrading()
  const { signal, refresh } = useMarketData(symbol, '1D')
  const { quote } = useRealtimeQuote(symbol, 15000)

  useEffect(() => {
    const id = setInterval(() => { if (isMarketHours()) refresh() }, CANDLE_REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  useExpiries(symbol)   // re-render when Groww's real expiry dates arrive
  const opts = buildOptionsSignal(signal, symbol, quote)
  const key = opts && opts.action !== 'WAIT' ? `${symbol}|${opts.action}|${opts.atmStrike}` : null

  useEffect(() => {
    if (!enabled || !key || !isMarketHours()) return
    const storeKey = `trade.lastAlert.${symbol}`
    const day = new Date().toDateString()
    let last = null
    try { last = localStorage.getItem(storeKey) } catch { /* ignore */ }
    if (last === `${day}|${key}`) return             // already alerted for this setup today
    try { localStorage.setItem(storeKey, `${day}|${key}`) } catch { /* ignore */ }

    const side = opts.optionType === 'CALL' ? 'CE' : 'PE'
    const title = `${opts.action}: ${symbol} ${opts.atmStrike} ${side}`
    const body = `Premium ~₹${opts.atmPremium} · SL ~₹${opts.premiumSL} · target ~₹${opts.premiumTarget}`
    const prefill = ticketFromSignal(opts)

    beep()
    toast((t) => (
      <div className="text-sm">
        <div className={`font-bold ${side === 'CE' ? 'text-bull' : 'text-bear'}`}>{title}</div>
        <div className="text-xs text-gray-400 mt-0.5">{body}</div>
        <button onClick={() => { toast.dismiss(t.id); openTicket(prefill) }}
          className="mt-2 px-3 py-1 rounded-md bg-primary-500/20 border border-primary-500/40 text-primary-400 text-xs font-semibold">
          Review order
        </button>
      </div>
    ), { duration: 60_000, id: `alert-${symbol}` })

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(title, { body, tag: `alert-${symbol}` })
        n.onclick = () => { window.focus(); openTicket(prefill); n.close() }
      } catch { /* some browsers only allow notifications from a service worker */ }
    }
  }, [key, enabled])   // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

const SignalWatcher = () => {
  const [enabled] = useSignalAlertsSetting()
  return SYMBOLS.map(s => <Watch key={s} symbol={s} enabled={enabled} />)
}

export default SignalWatcher
