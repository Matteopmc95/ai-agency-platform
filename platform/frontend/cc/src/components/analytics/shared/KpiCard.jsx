import { forwardRef } from 'react';

const KpiCard = forwardRef(function KpiCard(
  { label, value, subtitle, delta, deltaLabel, loading = false, className = '', valueClassName = 'text-3xl' },
  ref
) {
  const deltaPositive = delta > 0;
  const deltaNeutral  = delta === 0 || delta === null || delta === undefined;

  return (
    <div
      ref={ref}
      className={[
        'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm',
        className,
      ].join(' ')}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      {loading ? (
        <div className="mt-2 animate-pulse space-y-2">
          <div className="h-9 w-24 rounded-lg bg-neutral-200" />
          <div className="h-3 w-16 rounded bg-neutral-200" />
        </div>
      ) : (
        <>
          <p className={['mt-1.5 font-semibold tracking-tight text-ink', valueClassName].join(' ')}>{value ?? '—'}</p>
          <div className="mt-1 flex items-center gap-2">
            {subtitle && (
              <p className="text-xs text-neutral-500">{subtitle}</p>
            )}
            {!deltaNeutral && (
              <span className={[
                'inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[10px] font-semibold',
                deltaPositive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700',
              ].join(' ')}>
                {deltaPositive ? '+' : ''}{delta}
                {deltaLabel && ` ${deltaLabel}`}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
});

export default KpiCard;
