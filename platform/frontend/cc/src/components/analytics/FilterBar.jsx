import { useMemo, useState } from 'react';

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

export default function FilterBar({ filters, onUpdate, onReset, total, filtered, onOpenSidebar }) {
  const { from, to, segmenti, sources, stelle, status, customer } = filters;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activePreset = useMemo(() => {
    const today = todayIso();
    if (to !== today) return null;
    return DATE_PRESETS.find(p => p.from() === from)?.label ?? null;
  }, [from, to]);

  const hasActiveFilters =
    segmenti.length || sources.length || stelle.length || status || customer;

  const activeCount = segmenti.length + sources.length + stelle.length + (status ? 1 : 0) + (customer ? 1 : 0);

  // Shared filter controls (used on both mobile expanded and desktop inline)
  const FilterControls = () => (
    <>
      {/* Segmento chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-neutral-400">Segmento</span>
        {SEGMENTI.map(s => {
          const on = segmenti.includes(s.value);
          return (
            <button key={s.value} type="button" aria-pressed={on}
              onClick={() => onUpdate({ segmenti: toggleMulti(segmenti, s.value) })}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? s.active : s.idle}`}
            >{s.label}</button>
          );
        })}
      </div>

      {/* Source chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-neutral-400">Fonte</span>
        {SOURCES.map(s => {
          const on = sources.includes(s.value);
          return (
            <button key={s.value} type="button" aria-pressed={on}
              onClick={() => onUpdate({ sources: toggleMulti(sources, s.value) })}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? s.active : s.idle}`}
            >{s.label}</button>
          );
        })}
      </div>

      {/* Stelle + selects */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-neutral-400">Stelle</span>
        {[5, 4, 3, 2, 1].map(n => {
          const on = stelle.includes(n);
          return (
            <button key={n} type="button" aria-pressed={on} aria-label={`${n} stelle`}
              onClick={() => onUpdate({ stelle: toggleMulti(stelle, n) })}
              className={['rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                on ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
              ].join(' ')}
            >{n}★</button>
          );
        })}
        <select value={customer} onChange={e => onUpdate({ customer: e.target.value })}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
        >
          <option value="">Tutti i clienti</option>
          <option value="new">Nuovi</option>
          <option value="returning">Ricorrenti</option>
          <option value="cross2">Cross 2+</option>
          <option value="cross3plus">Cross 3+</option>
        </select>
        <select value={status} onChange={e => onUpdate({ status: e.target.value })}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
        >
          <option value="">Tutti gli stati</option>
          <option value="matched">Con BO</option>
          <option value="pending">In sync</option>
        </select>
        {hasActiveFilters && (
          <button type="button" onClick={onReset}
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
          >Azzera</button>
        )}
      </div>
    </>
  );

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-white">
      {/* Main row — always visible */}
      <div className="flex items-center gap-2 px-3 py-2 lg:flex-wrap lg:px-6 lg:py-2.5">

        {/* Hamburger — mobile only */}
        <button type="button" onClick={onOpenSidebar}
          className="shrink-0 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 lg:hidden"
          aria-label="Apri menu sezioni"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Date presets */}
        <div className="flex items-center gap-0.5 rounded-full border border-neutral-200 bg-neutral-50 p-0.5">
          {DATE_PRESETS.map(p => (
            <button key={p.label} type="button"
              onClick={() => onUpdate({ from: p.from(), to: todayIso() })}
              className={['rounded-full px-2.5 py-1 text-xs font-semibold transition',
                activePreset === p.label ? 'bg-white text-ink shadow-sm' : 'text-neutral-500 hover:text-ink',
              ].join(' ')}
            >{p.label}</button>
          ))}
        </div>

        {/* Custom date range — hidden on small mobile, visible md+ */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <input type="date" value={from} max={to}
            onChange={e => onUpdate({ from: e.target.value })}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
          />
          <span className="text-xs text-neutral-400">—</span>
          <input type="date" value={to} min={from}
            onChange={e => onUpdate({ to: e.target.value })}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
          />
        </div>

        {/* Desktop inline filters */}
        <div className="hidden lg:contents">
          <Divider />
          {SEGMENTI.map(s => {
            const on = segmenti.includes(s.value);
            return (
              <button key={s.value} type="button" aria-pressed={on}
                onClick={() => onUpdate({ segmenti: toggleMulti(segmenti, s.value) })}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? s.active : s.idle}`}
              >{s.label}</button>
            );
          })}
          <Divider />
          {SOURCES.map(s => {
            const on = sources.includes(s.value);
            return (
              <button key={s.value} type="button" aria-pressed={on}
                onClick={() => onUpdate({ sources: toggleMulti(sources, s.value) })}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? s.active : s.idle}`}
              >{s.label}</button>
            );
          })}
          <Divider />
          {[5, 4, 3, 2, 1].map(n => {
            const on = stelle.includes(n);
            return (
              <button key={n} type="button" aria-pressed={on} aria-label={`${n} stelle`}
                onClick={() => onUpdate({ stelle: toggleMulti(stelle, n) })}
                className={['rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                  on ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
                ].join(' ')}
              >{n}★</button>
            );
          })}
          <Divider />
          <select value={customer} onChange={e => onUpdate({ customer: e.target.value })}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
          >
            <option value="">Tutti i clienti</option>
            <option value="new">Nuovi</option>
            <option value="returning">Ricorrenti</option>
            <option value="cross2">Cross 2+ segmenti</option>
            <option value="cross3plus">Cross 3+ segmenti</option>
          </select>
          <select value={status} onChange={e => onUpdate({ status: e.target.value })}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
          >
            <option value="">Tutti gli stati</option>
            <option value="matched">Con BO</option>
            <option value="pending">In sync</option>
          </select>
          {hasActiveFilters && (
            <button type="button" onClick={onReset}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            >Azzera</button>
          )}
        </div>

        {/* Mobile: filter toggle button */}
        <button type="button" onClick={() => setFiltersOpen(v => !v)}
          className={['ml-auto flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition lg:hidden',
            filtersOpen ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-neutral-50 text-neutral-600',
          ].join(' ')}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
          </svg>
          Filtri{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>

        {/* Counter — desktop inline, mobile separate */}
        <span className="hidden text-xs text-neutral-500 lg:ml-auto lg:block">
          <span className="font-semibold text-ink">{filtered.toLocaleString('it-IT')}</span>
          {' / '}
          {total.toLocaleString('it-IT')}
        </span>
      </div>

      {/* Counter row mobile */}
      <div className="flex items-center justify-between px-3 pb-1.5 lg:hidden">
        <span className="text-xs text-neutral-500">
          <span className="font-semibold text-ink">{filtered.toLocaleString('it-IT')}</span>
          {' / '}{total.toLocaleString('it-IT')} rec.
        </span>
      </div>

      {/* Mobile expanded filters */}
      {filtersOpen && (
        <div className="space-y-3 border-t border-neutral-100 px-3 pb-3 pt-2 lg:hidden">
          {/* Date range on mobile */}
          <div className="flex items-center gap-2">
            <input type="date" value={from} max={to}
              onChange={e => onUpdate({ from: e.target.value })}
              className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
            />
            <span className="text-xs text-neutral-400">—</span>
            <input type="date" value={to} min={from}
              onChange={e => onUpdate({ to: e.target.value })}
              className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs font-medium text-neutral-700 outline-none focus:border-brand-400"
            />
          </div>
          <FilterControls />
        </div>
      )}
    </div>
  );
}
