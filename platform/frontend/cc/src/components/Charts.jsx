import { classNames } from '../lib/utils';

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

export function DonutChart({ items, total, centerLabel, centerValue }) {
  const safeTotal = total || 1;
  let currentAngle = 0;

  return (
    <div className="relative mx-auto h-56 w-56">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="42" fill="none" stroke="#F5F5F5" strokeWidth="12" />
        {items.map((item) => {
          const angle = (item.value / safeTotal) * 360;
          const path = describeArc(60, 60, 42, currentAngle, currentAngle + angle);
          currentAngle += angle;

          return (
            <path
              key={item.label}
              d={path}
              fill="none"
              stroke={item.color}
              strokeWidth="12"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">{centerLabel}</p>
        <p className="mt-2 text-3xl font-semibold text-ink">{centerValue}</p>
      </div>
    </div>
  );
}

export function HorizontalBarChart({ items, valueSuffix = '', emptyLabel = 'Nessun dato disponibile.' }) {
  const max = Math.max(...items.map((item) => item.value), 0);

  if (!items.length) {
    return <p className="text-sm text-neutral-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const width = max > 0 ? (item.value / max) * 100 : 0;

        return (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {item.color ? (
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                ) : null}
                <span className="truncate text-sm font-medium text-ink">{item.label}</span>
              </div>
              <span className="text-sm font-semibold text-neutral-500">
                {item.value}
                {valueSuffix}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${width}%`,
                  backgroundColor: item.color || '#FF8300',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MiniTrend({ items }) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="flex h-28 items-end gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-20 w-full items-end">
            <div
              className={classNames('w-full rounded-t-[12px] bg-brand-600 transition-all duration-500')}
              style={{ height: `${Math.max(12, (item.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-neutral-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
