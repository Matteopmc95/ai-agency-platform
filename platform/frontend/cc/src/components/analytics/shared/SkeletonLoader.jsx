function Pulse({ className }) {
  return <div className={['animate-pulse rounded-xl bg-neutral-200', className].join(' ')} />;
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <Pulse className="h-3 w-24 mb-4" />
      <Pulse className="h-8 w-32 mb-2" />
      <Pulse className="h-3 w-48" />
    </div>
  );
}

export default function SkeletonLoader() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <Pulse className="h-3 w-20 mb-3" />
            <Pulse className="h-9 w-16 mb-2" />
            <Pulse className="h-3 w-12" />
          </div>
        ))}
      </div>
      {/* Chart */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <Pulse className="h-3 w-32 mb-4" />
        <Pulse className="h-64 w-full" />
      </div>
      {/* Two cols */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
