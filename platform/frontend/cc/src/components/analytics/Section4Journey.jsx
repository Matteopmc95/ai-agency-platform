import { forwardRef, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import SectionWrapper from './shared/SectionWrapper';
import EmptyState from './shared/EmptyState';
import {
  SEGMENT_ORDER, SEGMENT_LABELS, SEGMENT_COLORS, SEGMENT_BADGE_CLS,
  GRID_COLOR, AXIS_COLOR,
} from './analytics-constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function anonymize(name) {
  if (!name || typeof name !== 'string') return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0] + '***';
  return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
}

function avgRating(reviews) {
  const rated = reviews.filter(r => r.stelle).map(r => Number(r.stelle));
  return rated.length ? Math.round(rated.reduce((s, v) => s + v, 0) / rated.length * 10) / 10 : 0;
}

function PyramidTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{d.label}</p>
      <p className="text-xs text-neutral-500">
        Recensioni: <span className="font-semibold text-ink">{d.count.toLocaleString('it-IT')}</span>
      </p>
      <p className="text-xs text-neutral-500">
        Quota: <span className="font-semibold text-ink">{d.pct}%</span>
      </p>
      <p className="text-xs text-neutral-500">
        Rating medio: <span className="font-semibold text-ink">{d.rating > 0 ? d.rating.toFixed(1) : '—'}</span>
      </p>
    </div>
  );
}

function HistTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <p className="text-xs text-neutral-500">
        Clienti: <span className="font-semibold text-ink">{payload[0]?.value}</span>
      </p>
    </div>
  );
}

// ── Section4Journey ───────────────────────────────────────────────────────────

const Section4Journey = forwardRef(function Section4Journey({ reviews }, ref) {
  const total = reviews.length;

  // Customer pyramid buckets
  const pyramid = useMemo(() => {
    if (!total) return [];
    const newC       = reviews.filter(r => (r.n_prenotazioni_precedenti || 0) === 0);
    const returning  = reviews.filter(r => (r.n_prenotazioni_precedenti || 0) >= 1);
    const cross      = reviews.filter(r => r.cross_ever_completed_only);
    const multiSeg   = reviews.filter(r => (r.segmenti_precedenti || []).length >= 2);

    return [
      { key: 'new',      label: 'Nuovi',            count: newC.length,      pct: Math.round(newC.length      / total * 100), rating: avgRating(newC),      color: '#0ea5e9' },
      { key: 'return',   label: 'Ricorrenti',        count: returning.length, pct: Math.round(returning.length / total * 100), rating: avgRating(returning), color: '#0d9488' },
      { key: 'cross',    label: 'Cross-segmento',    count: cross.length,     pct: Math.round(cross.length     / total * 100), rating: avgRating(cross),     color: '#7c3aed' },
      { key: 'multiseg', label: '3+ segmenti',       count: multiSeg.length,  pct: Math.round(multiSeg.length  / total * 100), rating: avgRating(multiSeg),  color: '#f97316' },
    ];
  }, [reviews, total]);

  // FROM → TO 4×4 matrix (only cross reviews where segmento_origine exists and differs)
  const crossMatrix = useMemo(() => {
    const matrix = {};
    SEGMENT_ORDER.forEach(from => {
      matrix[from] = {};
      SEGMENT_ORDER.forEach(to => { matrix[from][to] = 0; });
    });

    reviews.forEach(r => {
      const from = r.segmento_origine;
      const to   = r.segmento;
      if (!from || !to || !SEGMENT_ORDER.includes(from) || !SEGMENT_ORDER.includes(to)) return;
      matrix[from][to]++;
    });

    let maxVal = 1;
    SEGMENT_ORDER.forEach(from => {
      SEGMENT_ORDER.forEach(to => {
        if (matrix[from][to] > maxVal) maxVal = matrix[from][to];
      });
    });

    return { matrix, maxVal };
  }, [reviews]);

  // Time-to-cross histogram (giorni_da_prima_prenotazione, bins)
  const histData = useMemo(() => {
    const BINS = [
      { label: '0-30 gg',   min: 0,   max: 30 },
      { label: '1-3 mesi',  min: 31,  max: 90 },
      { label: '3-6 mesi',  min: 91,  max: 180 },
      { label: '6-12 mesi', min: 181, max: 365 },
      { label: '1-2 anni',  min: 366, max: 730 },
      { label: '2+ anni',   min: 731, max: Infinity },
    ];

    const crossReviews = reviews.filter(r => r.cross_ever_completed_only && r.giorni_da_prima_prenotazione != null);

    return BINS.map(bin => ({
      label: bin.label,
      count: crossReviews.filter(r => {
        const g = Number(r.giorni_da_prima_prenotazione);
        return g >= bin.min && g <= bin.max;
      }).length,
    }));
  }, [reviews]);

  // Satisfaction by journey type
  const satisfactionTable = useMemo(() => {
    const rows = [
      { label: 'Nuovi clienti',     filter: r => (r.n_prenotazioni_precedenti || 0) === 0 },
      { label: 'Ricorrenti',        filter: r => (r.n_prenotazioni_precedenti || 0) >= 1 },
      { label: 'Cross-segmento',    filter: r => !!r.cross_ever_completed_only },
      { label: '3+ segmenti',       filter: r => (r.segmenti_precedenti || []).length >= 2 },
    ];

    return rows.map(row => {
      const subset = reviews.filter(row.filter);
      const rating = avgRating(subset);
      const resp5  = subset.filter(r => Number(r.stelle) === 5).length;
      const resp12 = subset.filter(r => [1, 2].includes(Number(r.stelle))).length;
      const score  = subset.length ? Math.round((resp5 - resp12) / subset.length * 100) : 0;
      return {
        label:  row.label,
        count:  subset.length,
        rating,
        score,
        pct:    total > 0 ? Math.round(subset.length / total * 100) : 0,
      };
    });
  }, [reviews, total]);

  // Top 10 loyalty (by n_prenotazioni_precedenti desc), anonymized
  const topLoyalty = useMemo(() => {
    return [...reviews]
      .filter(r => (r.n_prenotazioni_precedenti || 0) >= 1)
      .sort((a, b) => (b.n_prenotazioni_precedenti || 0) - (a.n_prenotazioni_precedenti || 0))
      .slice(0, 10)
      .map(r => ({
        name:    anonymize(r.autore),
        seg:     r.segmento,
        prev:    r.n_prenotazioni_precedenti || 0,
        rating:  r.stelle ? Number(r.stelle) : 0,
        giorni:  r.giorni_da_prima_prenotazione || null,
      }));
  }, [reviews]);

  if (!total) {
    return (
      <SectionWrapper ref={ref} id="s4" label="Customer Journey" title="Customer Journey">
        <EmptyState message="Nessuna recensione nel periodo selezionato." />
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper
      ref={ref}
      id="s4"
      label="Customer Journey"
      title="Customer Journey"
      subtitle="Tipologia clienti, cross-segmento e fedelta nel tempo"
    >
      <div className="space-y-8">

        {/* ── Row 1: Pyramid + Satisfaction table ─────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Customer pyramid bar */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Tipologia clienti</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={pyramid}
                margin={{ top: 4, right: 40, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip content={<PyramidTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48} name="Recensioni">
                  {pyramid.map(d => <Cell key={d.key} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Satisfaction by journey */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Soddisfazione per tipo cliente</p>
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Tipo</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">N</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Rating</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {satisfactionTable.map(row => (
                    <tr key={row.label} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 font-medium text-ink">{row.label}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-600">
                        {row.count.toLocaleString('it-IT')}
                        <span className="ml-1 text-xs text-neutral-400">({row.pct}%)</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink">
                        {row.rating > 0 ? row.rating.toFixed(1) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${row.score >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {row.score > 0 ? '+' : ''}{row.score}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Row 2: Cross matrix + Time-to-cross hist ────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* FROM → TO matrix */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Percorso cross-segmento (Origine → Attuale)</p>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="py-2 pr-3 text-left text-xs font-semibold text-neutral-400">Da \ A</th>
                    {SEGMENT_ORDER.map(to => (
                      <th
                        key={to}
                        className="w-20 px-2 py-2 text-center text-xs font-semibold"
                        style={{ color: SEGMENT_COLORS[to] }}
                      >
                        {SEGMENT_LABELS[to]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SEGMENT_ORDER.map(from => (
                    <tr key={from}>
                      <td
                        className="py-1.5 pr-3 text-left text-xs font-semibold"
                        style={{ color: SEGMENT_COLORS[from] }}
                      >
                        {SEGMENT_LABELS[from]}
                      </td>
                      {SEGMENT_ORDER.map(to => {
                        const val = crossMatrix.matrix[from][to];
                        const isDiag = from === to;
                        const intensity = crossMatrix.maxVal > 0 ? val / crossMatrix.maxVal : 0;
                        const bg = isDiag
                          ? '#f9fafb'
                          : val > 0
                          ? `rgba(124,58,237,${Math.min(intensity * 0.8 + 0.1, 0.9)})`
                          : '#f9fafb';
                        return (
                          <td
                            key={to}
                            className="w-20 px-2 py-1.5 text-center font-semibold"
                            style={{
                              backgroundColor: bg,
                              color: !isDiag && intensity > 0.4 ? '#fff' : '#374151',
                              borderRadius: 6,
                            }}
                          >
                            {isDiag ? <span className="text-neutral-300">—</span> : (val > 0 ? val : '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Time-to-cross histogram */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Tempo alla prima cross-prenotazione</p>
            {histData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={histData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: AXIS_COLOR }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: AXIS_COLOR }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip content={<HistTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={40} name="Clienti" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-neutral-400">Nessun dato cross-segmento disponibile.</p>
            )}
          </div>
        </div>

        {/* ── Top 10 Loyalty ──────────────────────────────────────── */}
        {topLoyalty.length > 0 && (
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Top 10 clienti per fedelta</p>
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Cliente</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Segmento</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Prenotazioni prec.</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Anni cliente</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {topLoyalty.map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 font-medium text-ink">
                        <span className="mr-2 text-xs text-neutral-400">{i + 1}.</span>
                        {row.name}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.seg ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${SEGMENT_BADGE_CLS[row.seg] || ''}`}>
                            {SEGMENT_LABELS[row.seg] || row.seg}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink">{row.prev}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-600">
                        {row.giorni != null ? (Math.round(row.giorni / 365 * 10) / 10).toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {row.rating > 0 ? (
                          <span className={`font-semibold ${row.rating >= 4 ? 'text-emerald-600' : row.rating <= 2 ? 'text-red-600' : 'text-neutral-700'}`}>
                            {row.rating}★
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </SectionWrapper>
  );
});

export default Section4Journey;
