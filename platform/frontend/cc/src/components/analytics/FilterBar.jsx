import { useMemo } from 'react';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  { label: '7 gg',  from: () => daysAgoIso(7) },
  { label: '30 gg', from: () => daysAgoIso(30) },
  { label: '90 gg', from: () => daysAgoIso(90) },
  { label: '1 anno', from: () => daysAgoIso(365) },
  { label: 'Tutto', from: () => '2020-01-01' },
];

const SEGMENTI = [
  {
    value: 'airport', label: 'Airport',
    active: 'bg-sky-500 text-white border-sky-500',
    idle: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
  },
  {
    value: 'port', label: 'Port',
    active: 'bg-teal-600 text-white border-teal-600',
    idle: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
  },
  {
    value: 'city', label: 'City',
    active: 'bg-neutral-600 text-white border-neutral-600',
    idle: 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200',
  },
  {
    value: 'station', label: 'Station',
    active: 'bg-orange-500 text-white border-orange-500',
    idle: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  },
];

const SOURCES = [
  {
    value: 'trustpilot', label: 'Trustpilot',
    active: 'bg-emerald-600 text-white border-emerald-600',
    idle: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  },
  {
    value: 'apple', label: 'iOS',
    active: 'bg-neutral-700 text-white border-neutral-700',
    idle: 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200',
  },
  {
    value: 'playstore', label: 'Android',
    active: 'bg-blue-600 text-white border-blue-600',
    idle: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  },
  {
    value: 'gmb', label: 'Google',
    active: 'bg-red-600 text-white border-red-600',
    idle: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  },
];

function toggleMulti(arr, val) {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

function Divider() {
  return <div className="h-5 w-px shrink-0 bg-neutral-200" />;
}

export default function FilterBar({ filters, onUpdate, onReset, total, filtered }) {
  const { from, to, segmenti, sources, stelle, status, customer } = filters;

  const activePreset = useMemo(() => {
    const today = todayIso();
    if (to !== today) return null;
    return DATE_PRESETS.find(p => p.from() === from)?.label ?? null;
  }, [from, to]);

  const hasActiveFilters =
    segmenti.length || sources.length || stelle.length || status || customer;

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-2.5 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">

        {/* Date presets */}
        <div className="flex items-center gap-0.5 rounded-full border border-neutral-200 bg-neutral-50 p-0.5">
          {DATE_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => onUpdate({ from: p.from(), to: todayIso() })}
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                activePreset === p.label
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-neutral-500 hover:text-ink',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date" value={from} max={to}
            onChange={e => onUpdate({ from: e.target.value })}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
          />
          <span className="text-xs text-neutral-400">—</span>
          <input
            type="date" value={to} min={from}
            onChange={e => onUpdate({ to: e.target.value })}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
          />
        </div>

        <Divider />

        {/* Segmento chips */}
        {SEGMENTI.map(s => {
          const on = segmenti.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onUpdate({ segmenti: toggleMulti(segmenti, s.value) })}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? s.active : s.idle}`}
            >
              {s.label}
            </button>
          );
        })}

        <Divider />

        {/* Source chips */}
        {SOURCES.map(s => {
          const on = sources.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onUpdate({ sources: toggleMulti(sources, s.value) })}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? s.active : s.idle}`}
            >
              {s.label}
            </button>
          );
        })}

        <Divider />

        {/* Stelle */}
        {[5, 4, 3, 2, 1].map(n => {
          const on = stelle.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onUpdate({ stelle: toggleMulti(stelle, n) })}
              className={[
                'rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                on
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
              ].join(' ')}
            >
              {n}★
            </button>
          );
        })}

        <Divider />

        {/* Customer type */}
        <select
          value={customer}
          onChange={e => onUpdate({ customer: e.target.value })}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
        >
          <option value="">Tutti i clienti</option>
          <option value="new">Nuovi</option>
          <option value="returning">Ricorrenti</option>
          <option value="cross2">Cross 2+ segmenti</option>
          <option value="cross3plus">Cross 3+ segmenti</option>
        </select>

        {/* BO status */}
        <select
          value={status}
          onChange={e => onUpdate({ status: e.target.value })}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
        >
          <option value="">Tutti gli stati</option>
          <option value="matched">Con BO</option>
          <option value="pending">In sync</option>
        </select>

        {/* Reset */}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
          >
            Azzera
          </button>
        ) : null}

        {/* Counter */}
        <span className="ml-auto text-xs text-neutral-500">
          <span className="font-semibold text-ink">{filtered.toLocaleString('it-IT')}</span>
          {' / '}
          {total.toLocaleString('it-IT')}
        </span>
      </div>
    </div>
  );
}
