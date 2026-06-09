import { useEffect, useRef, useState } from 'react'

const AnimatedCounter = ({ value, duration = 800, decimals = 2, prefix = '', suffix = '' }) => {
  const [display, setDisplay] = useState(value)
  const prevValue = useRef(value)
  const rafRef = useRef(null)

  useEffect(() => {
    const start = prevValue.current
    const end = value
    const startTime = performance.now()

    const tick = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(parseFloat((start + (end - start) * eased).toFixed(decimals)))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
      else prevValue.current = end
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration, decimals])

  return (
    <span>
      {prefix}
      {new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(display)}
      {suffix}
    </span>
  )
}

export default AnimatedCounter
