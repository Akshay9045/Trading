const variantClasses = {
  bull: 'bg-bull/15 text-bull border-bull/25 shadow-[0_0_12px_rgba(0,212,161,0.2)]',
  bear: 'bg-bear/15 text-bear border-bear/25 shadow-[0_0_12px_rgba(255,77,109,0.2)]',
  hold: 'bg-hold/15 text-hold border-hold/25 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
  info: 'bg-primary-500/15 text-primary-400 border-primary-500/25',
  neutral: 'bg-white/10 text-gray-400 border-white/10',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  error: 'bg-red-500/15 text-red-400 border-red-500/25',
}

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-3 py-1',
  lg: 'text-base px-4 py-1.5 font-semibold',
}

const Badge = ({ children, variant = 'neutral', size = 'md', className = '', pulse = false }) => (
  <span className={`
    inline-flex items-center gap-1.5 rounded-full border font-medium font-mono
    ${variantClasses[variant]} ${sizeClasses[size]} ${className}
  `}>
    {pulse && (
      <span className={`relative flex h-2 w-2`}>
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
          ${variant === 'bull' ? 'bg-bull' : variant === 'bear' ? 'bg-bear' : 'bg-hold'}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2
          ${variant === 'bull' ? 'bg-bull' : variant === 'bear' ? 'bg-bear' : 'bg-hold'}`} />
      </span>
    )}
    {children}
  </span>
)

export default Badge
