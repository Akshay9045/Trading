const Skeleton = ({ className = '', variant = 'default' }) => {
  const base = `animate-pulse rounded-lg bg-gradient-to-r from-white/[0.05] via-white/[0.09] to-white/[0.05] bg-[length:200%_100%] animate-shimmer`
  return <div className={`${base} ${className}`} />
}

export const CardSkeleton = () => (
  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
    <div className="flex justify-between items-start">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
    <Skeleton className="h-8 w-32" />
    <div className="flex gap-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-16" />
    </div>
    <Skeleton className="h-16 w-full rounded-xl" />
  </div>
)

export const ChartSkeleton = () => (
  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4 h-96">
    <div className="flex justify-between">
      <Skeleton className="h-6 w-32" />
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-10 rounded-lg" />)}
      </div>
    </div>
    <Skeleton className="h-full w-full rounded-xl" />
  </div>
)

export const TableSkeleton = ({ rows = 5 }) => (
  <div className="space-y-2">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="flex gap-4 items-center p-3 rounded-xl border border-white/[0.05]">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20 ml-auto" />
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
)

export default Skeleton
