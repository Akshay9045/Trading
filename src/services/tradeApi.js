import axios from 'axios'
import { watchForLogout } from './authApi'

// Client for the server's /api/trade/* routes (server/trading.js). The custom
// header is required by the server — it rejects requests without it, which keeps
// other websites from posting orders to this local server.
const http = axios.create({
  baseURL: '/api/trade',
  timeout: 20000,
  headers: { 'X-Trade-Client': 'nifty-terminal' },
})
watchForLogout(http)

// Surface the server's own error message instead of axios' generic one
const call = (p) => p.then(r => r.data).catch(err => {
  throw new Error(err.response?.data?.error || err.message)
})

export const tradeApi = {
  status:           ()          => call(http.get('/status')),
  setMode:          (mode, confirm) => call(http.post('/mode', { mode, confirm })),
  expiries:         (underlying) => call(http.get('/expiries', { params: { underlying } })),
  contract:         (params)    => call(http.get('/contract', { params })),
  book:             ()          => call(http.get('/book')),
  placeOrder:       (order)     => call(http.post('/order', order)),
  cancelOrder:      (orderId)   => call(http.post('/cancel', { orderId })),
  exit:             (tradingSymbol) => call(http.post('/exit', { tradingSymbol })),
  exitAll:          ()          => call(http.post('/exit-all')),
  retryProtection:  (bracketId) => call(http.post('/protect', { bracketId })),
  cancelProtection: (ocoId)     => call(http.post('/cancel-protection', { ocoId })),
  resetPaper:       ()          => call(http.post('/paper/reset')),
}
