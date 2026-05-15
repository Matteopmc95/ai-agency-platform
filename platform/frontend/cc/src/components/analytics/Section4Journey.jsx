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

function avgRating(reviews) {
  const rated = reviews.filter(r => r.stelle).map(r => Number(r.stelle));
  return rated.length ? Math.round(rated.reduce((s, v) => s + v, 0) / rated.length * 10) / 10 : 0;
}

function satisfactionScore(reviews) {
  const n = reviews.length;
  if (!n) return null;
  const c5  = reviews.filter(r => Number(r.stelle) === 5).length;
  const c12 = reviews.filter(r => [1, 2].includes(Number(r.stelle))).length;
  return Math.round((c5 - c12) / n * 100);
}

function anonymizeName(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[1][0].toUpperCase() + '.';
}

// ── Pyramid tooltip ───────────────────────────────────────────────────────────

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

// ── Time-to-cross tooltip ─────────────────────────────────────────────────────

function CrossTooltip({ active, payload, label }) {
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

// ── Matrix tooltip ────────────────────────────────────────────────────────────

function MatrixCell({ count, maxCount, fromSeg, toSeg, rating }) {
  if (count === 0) {
    return (
      <td className="border border-neutral-100 p-0">
        <div className="flex h-12 items-center justify-center text-xs text-neutral-300">—</div>
      </td>
    );
  }
  const intensity = maxCount > 0 ? count / maxCount : 0;
  const isDiag = fromSeg === toSeg;
  const bg = isDiag
    ? `rgba(124, 58, 237, ${0.15 + intensity * 0.7})`
    : `rgba(14, 165, 233, ${0.12 + intensity * 0.7})`;

  return (
    <td
      className="border border-neutral-100 p-0"
      title={`${fromSeg} → ${toSeg}: ${count} clienti, rating medio ${rating > 0 ? rating.toFixed(1) : '—'}`}
    >
      <div
        className="flex h-12 flex-col items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        <span className="text-sm font-bold text-ink">{count}</span>
        {rating > 0 && (
          <span className="text-[10px] text-neutral-500">{rating.toFixed(1)}</span>
        )}
      </div>
    </td>
  );
}

// ── Time-to-cross buckets ─────────────────────────────────────────────────────

const CROSS_BUCKETS = [
  { label: '0-30g',   min: 0,   max: 30   },
  { label: '1-3m',    min: 30,  max: 90   },
  { label: '3-6m',    min: 90,  max: 180  },
  { label: '6-12m',   min: 180, max: 365  },
  { label: '1-2a',    min: 365, max: 730  },
  { label: '2+a',     min: 730, max: Infinity },
];

// ── Section4Journey ───────────────────────────────────────────────────────────

const Section4Journey = forwardRef(function Section4Journey({ reviews }, ref) {
  const total = reviews.length;

  // 3.1 Customer Pyramid — uses new Step-2 fields
  const pyramid = useMemo(() => {
    if (!total) return [];

    const nuovi      = reviews.filter(r => r.n_prenotazioni_precedenti === 0);
    const ricorrenti = reviews.filter(r =>
      r.n_prenotazioni_precedenti > 0 && !r.cross_ever_completed_only
    );
    const cross2     = reviews.filter(r =>
      r.cross_ever_completed_only &&
      (r.segmenti_precedenti_completed?.length || 0) === 1
    );
    const cross3plus = reviews.filter(r =>
      r.cross_ever_completed_only &&
      (r.segmenti_precedenti_completed?.length || 0) >= 2
    );
    const unknown    = reviews.filter(r => r.n_prenotazioni_precedenti === null);

    const buckets = [
      { key: 'nuovi',      label: 'Nuovi',             arr: nuovi,      color: '#0ea5e9' },
      { key: 'ricorrenti', label: 'Ricorrenti',         arr: ricorrenti, color: '#0d9488' },
      { key: 'cross2',     label: 'Cross 2 segmenti',   arr: cross2,     color: '#7c3aed' },
      { key: 'cross3plus', label: 'Cross 3+ segmenti',  arr: cross3plus, color: '#dc2626' },
    ];
    if (unknown.length > 0) {
      buckets.push({ key: 'unknown', label: 'Dati mancanti', arr: unknown, color: '#94a3b8' });
    }

    return buckets.map(b => ({
      key:    b.key,
      label:  b.label,
      count:  b.arr.length,
      pct:    Math.round(b.arr.length / total * 100),
      rating: avgRating(b.arr),
      color:  b.color,
    })).filter(b => b.count > 0 || b.key !== 'unknown');
  }, [reviews, total]);

  // 3.2 FROM→TO Matrix 4×4
  const matrix = useMemo(() => {
    const cells = {};
    const ratingAccum = {};

    SEGMENT_ORDER.forEach(from => {
      SEGMENT_ORDER.forEach(to => {
        cells[`${from}-${to}`] = 0;
        ratingAccum[`${from}-${to}`] = [];
      });
    });

    reviews.forEach(r => {
      const from = r.segmento_origine;
      const to   = r.segmento;
      if (from && to && cells[`${from}-${to}`] !== undefined) {
        cells[`${from}-${to}`]++;
        if (r.stelle) ratingAccum[`${from}-${to}`].push(Number(r.stelle));
      }
    });

    const maxCount = Math.max(...Object.values(cells));

    return { cells, ratingAccum, maxCount };
  }, [reviews]);

  const hasMatrixData = useMemo(() =>
    Object.values(matrix.cells).some(v => v > 0),
  [matrix]);

  // 3.3 Time-to-cross histogram
  const crossHistogram = useMemo(() => {
    const crossReviews = reviews.filter(r =>
      r.cross_completed_only === true && r.giorni_da_prima_prenotazione != null
    );

    return CROSS_BUCKETS.map(b => ({
      label: b.label,
      count: crossReviews.filter(r =>
        r.giorni_da_prima_prenotazione >= b.min &&
        r.giorni_da_prima_prenotazione < b.max
      ).length,
    }));
  }, [reviews]);

  const hasCrossData = crossHistogram.some(b => b.count > 0);

  // 3.4 Top 10 Loyalty (aggregato per autore)
  const loyaltyTable = useMemo(() => {
    const byAuthor = new Map();

    reviews.forEach(r => {
      const key = (r.autore || '').trim().toLowerCase();
      if (!key) return;

      if (!byAuthor.has(key)) {
        byAuthor.set(key, {
          displayName: (r.autore || '').trim(),
          ratings: [],
          maxPrenotazioni: null,
          maxGiorni: null,
          segmentiSet: new Set(),
        });
      }
      const entry = byAuthor.get(key);
      if (r.stelle) entry.ratings.push(Number(r.stelle));

      if (r.n_prenotazioni_precedenti_completed != null) {
        if (entry.maxPrenotazioni === null || r.n_prenotazioni_precedenti_completed > entry.maxPrenotazioni) {
          entry.maxPrenotazioni = r.n_prenotazioni_precedenti_completed;
        }
      }
      if (r.giorni_da_prima_prenotazione != null) {
        if (entry.maxGiorni === null || r.giorni_da_prima_prenotazione > entry.maxGiorni) {
          entry.maxGiorni = r.giorni_da_prima_prenotazione;
        }
      }
      if (r.segmento) entry.segmentiSet.add(r.segmento);
      (r.segmenti_precedenti_completed || []).forEach(s => entry.segmentiSet.add(s));
    });

    return [...byAuthor.values()]
      .filter(e => e.maxPrenotazioni !== null && e.maxPrenotazioni > 0)
      .map(e => ({
        displayName: anonymizeName(e.displayName),
        prenotazioni: e.maxPrenotazioni,
        segmenti:    e.segmentiSet.size,
        anni:        e.maxGiorni != null ? (e.maxGiorni / 365).toFixed(1) : null,
        rating:      e.ratings.length
          ? Math.round(e.ratings.reduce((s, v) => s + v, 0) / e.ratings.length * 10) / 10
          : null,
      }))
      .sort((a, b) => b.prenotazioni - a.prenotazioni)
      .slice(0, 10);
  }, [reviews]);

  // 3.5 Satisfaction by Journey Type
  const satisfactionTable = useMemo(() => {
    const segRows = SEGMENT_ORDER.map(seg => ({
      label:  `Solo ${SEGMENT_LABELS[seg]}`,
      filter: r => !r.cross_ever_completed_only && r.segmento === seg,
    }));
    const crossRows = [
      { label: 'Cross 2 segmenti',  filter: r => r.cross_ever_completed_only && (r.segmenti_precedenti_completed?.length || 0) === 1 },
      { label: 'Cross 3+ segmenti', filter: r => r.cross_ever_completed_only && (r.segmenti_precedenti_completed?.length || 0) >= 2 },
    ];

    return [...segRows, ...crossRows].map(row => {
      const subset = reviews.filter(row.filter);
      const rating = avgRating(subset);
      const score  = satisfactionScore(subset);
      return {
        label:  row.label,
        count:  subset.length,
        rating,
        score:  score ?? 0,
        pct:    total > 0 ? Math.round(subset.length / total * 100) : 0,
      };
    }).filter(row => row.count > 0);
  }, [reviews, total]);

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
      subtitle="Piramide clienti, transizioni cross-segmento, tempo di conversione e fedelta"
    >
      <div className="space-y-8">

        {/* ── 3.1 Customer Pyramid ────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Piramide clienti</p>
            <ResponsiveContainer width="100%" height={200}>
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
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56} name="Recensioni">
                  {pyramid.map(d => <Cell key={d.key} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-3 flex flex-wrap gap-3">
              {pyramid.filter(d => d.key !== 'unknown').map(d => (
                <div key={d.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-neutral-600">{d.label}</span>
                  <span className="text-xs font-semibold text-ink">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 3.5 Satisfaction by Journey Type ──────────────────── */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Soddisfazione per tipo cliente</p>
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Tipo</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">N</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Rating</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {satisfactionTable.map(row => (
                    <tr key={row.label} className="hover:bg-neutral-50">
                      <td className="px-3 py-2.5 font-medium text-ink">{row.label}</td>
                      <td className="px-3 py-2.5 text-right text-neutral-600">
                        {row.count.toLocaleString('it-IT')}
                        <span className="ml-1 text-xs text-neutral-400">({row.pct}%)</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-ink">
                        {row.rating > 0 ? row.rating.toFixed(1) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${row.score >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {row.score > 0 ? '+' : ''}{row.score}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── 3.2 FROM→TO Matrix ──────────────────────────────────── */}
        <div>
          <p className="mb-4 text-sm font-semibold text-neutral-700">Matrice transizioni segmento (Origine → Attuale)</p>
          {hasMatrixData ? (
            <div className="overflow-x-auto">
              <table className="min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-neutral-100 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold text-neutral-500">
                      Origine ↓ / Attuale →
                    </th>
                    {SEGMENT_ORDER.map(to => (
                      <th
                        key={to}
                        className="border border-neutral-100 bg-neutral-50 px-3 py-2 text-center text-xs font-semibold"
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
                        className="border border-neutral-100 bg-neutral-50 px-3 py-2 text-xs font-semibold"
                        style={{ color: SEGMENT_COLORS[from] }}
                      >
                        {SEGMENT_LABELS[from]}
                      </td>
                      {SEGMENT_ORDER.map(to => {
                        const key = `${from}-${to}`;
                        const count = matrix.cells[key] || 0;
                        const ratings = matrix.ratingAccum[key] || [];
                        const rating = ratings.length
                          ? ratings.reduce((s, v) => s + v, 0) / ratings.length
                          : 0;
                        return (
                          <MatrixCell
                            key={to}
                            count={count}
                            maxCount={matrix.maxCount}
                            fromSeg={from}
                            toSeg={to}
                            rating={rating}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-neutral-400">
                Viola = stesso segmento. Azzurro = cross-segmento. Intensita proporzionale al volume.
              </p>
            </div>
          ) : (
            <p className="text-sm text-neutral-400">
              Nessun dato di segmento_origine disponibile per il periodo selezionato.
            </p>
          )}
        </div>

        {/* ── 3.3 Time-to-Cross ───────────────────────────────────── */}
        {hasCrossData && (
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Tempo alla prima esperienza cross-segmento</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={crossHistogram}
                margin={{ top: 4, right: 32, left: 0, bottom: 0 }}
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
                <Tooltip content={<CrossTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={48} name="Clienti" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── 3.4 Top 10 Loyalty ──────────────────────────────────── */}
        {loyaltyTable.length > 0 && (
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Top 10 clienti per fedeltà</p>
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">#</th>
                    <th className="min-w-[160px] px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Cliente</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Anni</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Prenotazioni</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Segmenti</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loyaltyTable.map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 text-xs text-neutral-400">{i + 1}</td>
                      <td className="min-w-[160px] px-4 py-2.5 font-medium text-ink">{row.displayName}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-700">
                        {row.anni != null ? row.anni : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink">
                        {row.prenotazioni.toLocaleString('it-IT')}
                      </td>
                      <td className="px-4 py-2.5 text-right text-neutral-700">{row.segmenti}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink">
                        {row.rating != null ? row.rating.toFixed(1) : '—'}
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
