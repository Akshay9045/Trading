import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import { motion } from 'framer-motion'
import { calculateEMA, calculateBollingerBands } from '../../utils/indicators'
import { formatPrice } from '../../utils/formatters'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1D', '1W']

const OVERLAYS = [
  { id: 'ema9',  label: 'EMA 9',  color: '#f59e0b' },
  { id: 'ema20', label: 'EMA 20', color: '#0ea5e9' },
  { id: 'ema50', label: 'EMA 50', color: '#a855f7' },
  { id: 'bb',    label: 'BB',     color: '#06b6d4' },
]

const CandlestickChart = ({ candles, quote, signal, timeframe, onTimeframeChange, loading }) => {
  const containerRef   = useRef(null)
  const chartRef       = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const overlaySeriesRef = useRef({})
  const resizeObserverRef = useRef(null)

  const [activeOverlays, setActiveOverlays] = useState(['ema20', 'ema50'])
  const [crosshairData, setCrosshairData]   = useState(null)

  // ── Initialize chart once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background:  { type: ColorType.Solid, color: 'transparent' },
        textColor:   'rgba(156, 163, 175, 0.9)',
        fontFamily:  "'JetBrains Mono', monospace",
        fontSize:    11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(255,255,255,0.04)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(14,165,233,0.5)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0ea5e9' },
        horzLine: { color: 'rgba(14,165,233,0.5)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0ea5e9' },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: 'rgba(156,163,175,0.7)',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible:   true,
        secondsVisible: false,
        fixLeftEdge:   true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale:  { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })

    chartRef.current = chart

    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor:        '#00d4a1',
      downColor:      '#ff4d6d',
      borderUpColor:  '#00d4a1',
      borderDownColor:'#ff4d6d',
      wickUpColor:    'rgba(0,212,161,0.7)',
      wickDownColor:  'rgba(255,77,109,0.7)',
    })

    volumeSeriesRef.current = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    chart.subscribeCrosshairMove(param => {
      if (!param.time || !candleSeriesRef.current) {
        setCrosshairData(null)
        return
      }
      const d = param.seriesData.get(candleSeriesRef.current)
      if (d) setCrosshairData(d)
    })

    // Resize observer stored in its own ref, not on the chart object
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)
    resizeObserverRef.current = ro

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      try { chartRef.current?.remove() } catch {}
      chartRef.current       = null
      candleSeriesRef.current  = null
      volumeSeriesRef.current  = null
      overlaySeriesRef.current = {}
    }
  }, [])   // runs once

  // ── Update candle / overlay data when candles or activeOverlays change ─────
  useEffect(() => {
    if (!candles.length || !chartRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return

    try {
      candleSeriesRef.current.setData(candles)
      volumeSeriesRef.current.setData(
        candles.map(c => ({
          time:  c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(0,212,161,0.3)' : 'rgba(255,77,109,0.3)',
        }))
      )
    } catch { return }

    // Remove old overlay series
    Object.values(overlaySeriesRef.current).forEach(s => {
      try { chartRef.current?.removeSeries(s) } catch {}
    })
    overlaySeriesRef.current = {}

    const closes = candles.map(c => c.close)

    const addLine = (data, opts) => {
      try {
        const s = chartRef.current.addLineSeries({ priceLineVisible: false, lastValueVisible: false, ...opts })
        s.setData(data.filter(Boolean))
        return s
      } catch { return null }
    }

    const toPoints = (values) =>
      candles.map((c, i) => values[i] !== null && values[i] !== undefined ? { time: c.time, value: values[i] } : null)

    if (activeOverlays.includes('ema9')) {
      const s = addLine(toPoints(calculateEMA(closes, 9)), { color: '#f59e0b', lineWidth: 1, title: 'EMA9' })
      if (s) overlaySeriesRef.current.ema9 = s
    }
    if (activeOverlays.includes('ema20')) {
      const s = addLine(toPoints(calculateEMA(closes, 20)), { color: '#0ea5e9', lineWidth: 1.5, title: 'EMA20' })
      if (s) overlaySeriesRef.current.ema20 = s
    }
    if (activeOverlays.includes('ema50')) {
      const s = addLine(toPoints(calculateEMA(closes, 50)), { color: '#a855f7', lineWidth: 1.5, title: 'EMA50' })
      if (s) overlaySeriesRef.current.ema50 = s
    }
    if (activeOverlays.includes('bb')) {
      const { upper, lower, middle } = calculateBollingerBands(closes)
      const su = addLine(toPoints(upper),  { color: 'rgba(6,182,212,0.6)', lineWidth: 1, title: 'BB Upper' })
      const sl = addLine(toPoints(lower),  { color: 'rgba(6,182,212,0.6)', lineWidth: 1, title: 'BB Lower' })
      const sm = addLine(toPoints(middle), { color: 'rgba(6,182,212,0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB Mid' })
      if (su) overlaySeriesRef.current.bbUpper = su
      if (sl) overlaySeriesRef.current.bbLower = sl
      if (sm) overlaySeriesRef.current.bbMid   = sm
    }

    try { chartRef.current?.timeScale().fitContent() } catch {}
  }, [candles, activeOverlays])

  const toggleOverlay = (id) =>
    setActiveOverlays(prev => prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-white/[0.05]">
        {/* Crosshair or live quote info */}
        <div className="flex items-center gap-4 font-mono text-xs min-w-0">
          {crosshairData ? (
            <>
              <span className="text-gray-400">O <span className="text-white">{crosshairData.open?.toFixed(2)}</span></span>
              <span className="text-bull">H <span className="text-white">{crosshairData.high?.toFixed(2)}</span></span>
              <span className="text-bear">L <span className="text-white">{crosshairData.low?.toFixed(2)}</span></span>
              <span className="text-gray-400">C{' '}
                <span className={crosshairData.close >= crosshairData.open ? 'text-bull' : 'text-bear'}>
                  {crosshairData.close?.toFixed(2)}
                </span>
              </span>
            </>
          ) : quote ? (
            <>
              <span className={`text-lg font-bold ${quote.changePercent >= 0 ? 'text-bull' : 'text-bear'}`}>
                {formatPrice(quote.price)}
              </span>
              <span className={`text-sm ${quote.changePercent >= 0 ? 'text-bull' : 'text-bear'}`}>
                {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent?.toFixed(2)}%
              </span>
            </>
          ) : <span className="text-gray-600 text-xs">Loading…</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Indicator overlays */}
          <div className="flex items-center gap-1">
            {OVERLAYS.map(o => (
              <button
                key={o.id}
                onClick={() => toggleOverlay(o.id)}
                className="px-2 py-1 rounded text-[10px] font-mono font-medium border transition-all"
                style={
                  activeOverlays.includes(o.id)
                    ? { background: o.color + '25', borderColor: o.color + '40', color: o.color }
                    : { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(156,163,175,0.6)' }
                }
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Timeframes */}
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => onTimeframeChange?.(tf)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all
                  ${timeframe === tf
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'text-gray-500 hover:text-gray-300'
                  }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart container */}
      <div className="flex-1 relative min-h-[350px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-300/80 z-10 rounded-b-2xl">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-400 text-sm">Loading chart data…</span>
            </div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}

export default CandlestickChart
