// Realistic mock data generator for NIFTY trading terminal

const NIFTY_BASE = 23303
const BANKNIFTY_BASE = 51200
const VIX_BASE = 10.2

const seededRandom = (seed) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

export const generateCandles = (symbol, timeframe = '1D', count = 200) => {
  const bases = {
    NIFTY: NIFTY_BASE,
    BANKNIFTY: BANKNIFTY_BASE,
    SENSEX: 76800,
    'RELIANCE.NSE': 1420,
    'TCS.NSE': 3210,
    'HDFCBANK.NSE': 1910,
    'INFY.NSE': 1580,
    'ICICIBANK.NSE': 1390,
    'HINDUNILVR.NSE': 2350,
    'SBIN.NSE': 810,
    'BAJFINANCE.NSE': 8950,
    'KOTAKBANK.NSE': 2120,
    'LT.NSE': 3680,
    'WIPRO.NSE': 275,
    'MARUTI.NSE': 12400,
  }

  const base = bases[symbol] || NIFTY_BASE
  const volatility = symbol === 'BANKNIFTY' ? 0.012 : symbol === 'VIX' ? 0.05 : 0.008
  // Include current day in seed so signal changes daily (not stuck forever)
  const daySeed = Math.floor(Date.now() / 86400000)
  const rng = seededRandom(symbol.charCodeAt(0) * 31 + timeframe.length * 17 + daySeed)

  const intervalMs = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '1h': 3600000,
    '1D': 86400000,
    '1W': 604800000,
  }

  const ms = intervalMs[timeframe] || 86400000
  const now = Date.now()
  const candles = []
  let price = base * (0.95 + rng() * 0.1)

  for (let i = count; i >= 0; i--) {
    const time = Math.floor((now - i * ms) / 1000)
    const open = price
    const change = (rng() - 0.48) * price * volatility
    const high = open + Math.abs(rng() * price * volatility * 0.8)
    const low = open - Math.abs(rng() * price * volatility * 0.8)
    const close = Math.max(low + 1, Math.min(high - 1, open + change))
    const volume = Math.floor(50000 + rng() * 500000)

    candles.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(Math.max(open, close, high).toFixed(2)),
      low: parseFloat(Math.min(open, close, low).toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    })
    price = close
  }

  return candles
}

export const getMockQuote = (symbol) => {
  const rng = seededRandom(Date.now() + symbol.charCodeAt(0))

  const bases = {
    NIFTY: NIFTY_BASE,
    BANKNIFTY: BANKNIFTY_BASE,
    SENSEX: 76800,
    VIX: VIX_BASE,
    'RELIANCE.NSE': 1420,
    'TCS.NSE': 3210,
    'HDFCBANK.NSE': 1910,
    'INFY.NSE': 1580,
    'ICICIBANK.NSE': 1390,
    'HINDUNILVR.NSE': 2350,
    'SBIN.NSE': 810,
    'BAJFINANCE.NSE': 8950,
    'KOTAKBANK.NSE': 2120,
    'LT.NSE': 3680,
    'WIPRO.NSE': 275,
    'MARUTI.NSE': 12400,
    'AXISBANK.NSE': 1210,
    'SUNPHARMA.NSE': 1890,
    'TITAN.NSE': 3520,
    'ADANIENT.NSE': 2280,
  }

  const base = bases[symbol] || 1000
  const change = (rng() - 0.45) * base * 0.02
  const price = base + change
  const changePercent = (change / base) * 100

  return {
    symbol,
    price: parseFloat(price.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    open: parseFloat((base * (0.998 + rng() * 0.004)).toFixed(2)),
    high: parseFloat((price * (1 + rng() * 0.008)).toFixed(2)),
    low: parseFloat((price * (1 - rng() * 0.008)).toFixed(2)),
    prevClose: parseFloat(base.toFixed(2)),
    volume: Math.floor(100000 + rng() * 5000000),
    dayHigh52W: parseFloat((base * 1.28).toFixed(2)),
    dayLow52W: parseFloat((base * 0.72).toFixed(2)),
    pe: parseFloat((18 + rng() * 8).toFixed(2)),
    marketCap: parseFloat((base * 1e7 * (1 + rng() * 0.5) / 1e12).toFixed(2)),
    timestamp: Date.now(),
  }
}

export const getTopMovers = () => {
  const gainers = [
    { symbol: 'ADANIENT', name: 'Adani Enterprises' },
    { symbol: 'SUNPHARMA', name: 'Sun Pharma' },
    { symbol: 'BAJFINANCE', name: 'Bajaj Finance' },
    { symbol: 'MARUTI', name: 'Maruti Suzuki' },
    { symbol: 'TITAN', name: 'Titan Company' },
  ]
  const losers = [
    { symbol: 'WIPRO', name: 'Wipro' },
    { symbol: 'HCLTECH', name: 'HCL Technologies' },
    { symbol: 'TECHM', name: 'Tech Mahindra' },
    { symbol: 'AXISBANK', name: 'Axis Bank' },
    { symbol: 'ONGC', name: 'ONGC' },
  ]

  return {
    gainers: gainers.map((s, i) => ({
      ...s,
      price: parseFloat((500 + i * 200 + Math.random() * 100).toFixed(2)),
      change: parseFloat((1.2 + Math.random() * 3).toFixed(2)),
      volume: Math.floor(500000 + Math.random() * 2000000),
    })),
    losers: losers.map((s, i) => ({
      ...s,
      price: parseFloat((300 + i * 150 + Math.random() * 100).toFixed(2)),
      change: parseFloat((-0.8 - Math.random() * 2.5).toFixed(2)),
      volume: Math.floor(300000 + Math.random() * 1500000),
    })),
  }
}

export const getNifty50Stocks = () => [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', weight: 10.2 },
  { symbol: 'TCS', name: 'Tata Consultancy', sector: 'IT', weight: 8.1 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', weight: 7.8 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', weight: 6.2 },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT', weight: 5.9 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'FMCG', weight: 4.1 },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking', weight: 3.8 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Finance', weight: 3.6 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking', weight: 3.2 },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure', weight: 2.9 },
]

export const generateSignalHistory = (count = 20) => {
  const signals = []
  const types = ['BUY', 'SELL', 'BUY', 'BUY', 'HOLD', 'SELL', 'BUY']
  const symbols = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY']

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length]
    const symbol = symbols[i % symbols.length]
    const base = symbol === 'NIFTY' ? 24500 : symbol === 'BANKNIFTY' ? 52000 : 2000
    const entry = base + (Math.random() - 0.5) * base * 0.02
    const atr = base * 0.005
    const target = type === 'BUY' ? entry + atr * 3 : entry - atr * 3
    const sl = type === 'BUY' ? entry - atr : entry + atr
    const isWin = Math.random() > 0.35

    signals.push({
      id: i + 1,
      symbol,
      type,
      entry: parseFloat(entry.toFixed(2)),
      target: parseFloat(target.toFixed(2)),
      stopLoss: parseFloat(sl.toFixed(2)),
      confidence: Math.floor(65 + Math.random() * 30),
      rrRatio: parseFloat((Math.abs(target - entry) / Math.abs(entry - sl)).toFixed(1)),
      status: i < 3 ? 'ACTIVE' : isWin ? 'TARGET_HIT' : i % 5 === 0 ? 'SL_HIT' : 'CLOSED',
      pnl: i < 3 ? null : isWin ? parseFloat((Math.abs(target - entry) * (1 + Math.random() * 0.5)).toFixed(2)) : parseFloat((-Math.abs(entry - sl) * (1 + Math.random() * 0.3)).toFixed(2)),
      timestamp: new Date(Date.now() - i * 3600000 * (1 + Math.random() * 5)).toISOString(),
      indicators: {
        rsi: Math.floor(25 + Math.random() * 50),
        macd: type === 'BUY' ? 'Bullish Crossover' : 'Bearish Crossover',
        ema: type === 'BUY' ? 'Price above EMA20' : 'Price below EMA20',
        volume: Math.random() > 0.5 ? 'High' : 'Normal',
      },
    })
  }
  return signals
}
