import { motion } from 'framer-motion'

const GlassCard = ({
  children,
  className = '',
  hover = false,
  glow = null,
  animate = true,
  delay = 0,
  onClick,
}) => {
  const glowClass = glow === 'bull'
    ? 'hover:shadow-bull hover:border-bull/30'
    : glow === 'bear'
    ? 'hover:shadow-bear hover:border-bear/30'
    : 'hover:border-white/20'

  const base = `
    relative rounded-2xl border border-white/[0.08]
    bg-gradient-to-br from-white/[0.07] to-white/[0.02]
    backdrop-blur-sm overflow-hidden
    transition-all duration-300
    ${hover ? `cursor-pointer ${glowClass}` : ''}
    ${className}
  `

  const content = (
    <>
      {/* Subtle inner highlight */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
      {children}
    </>
  )

  if (!animate) return <div className={base} onClick={onClick}>{content}</div>

  return (
    <motion.div
      className={base}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={hover ? { scale: 1.01 } : undefined}
      onClick={onClick}
    >
      {content}
    </motion.div>
  )
}

export default GlassCard
