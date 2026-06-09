export const formatPrice = (price, decimals = 2) => {
  if (price === null || price === undefined || isNaN(price)) return '--'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(price)
}

export const formatVolume = (vol) => {
  if (!vol) return '--'
  if (vol >= 1e7) return `${(vol / 1e7).toFixed(2)}Cr`
  if (vol >= 1e5) return `${(vol / 1e5).toFixed(2)}L`
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`
  return vol.toString()
}

export const formatPercent = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '--'
  const sign = val >= 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}%`
}

export const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatCurrency = (val) => {
  if (!val) return '--'
  return `₹${formatPrice(val)}`
}

export const getChangeColor = (change) => {
  if (change > 0) return 'text-bull'
  if (change < 0) return 'text-bear'
  return 'text-gray-400'
}

export const getChangeBg = (change) => {
  if (change > 0) return 'bg-bull/10 text-bull border-bull/20'
  if (change < 0) return 'bg-bear/10 text-bear border-bear/20'
  return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
}

export const getSignalColor = (signal) => {
  if (signal === 'BUY') return 'bull'
  if (signal === 'SELL') return 'bear'
  return 'hold'
}

export const timeAgo = (date) => {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
