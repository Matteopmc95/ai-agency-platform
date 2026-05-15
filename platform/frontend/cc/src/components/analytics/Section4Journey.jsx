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

// ── Notice: campi non disponibili nell'API ─────────────────────────────────────

function MissingDataNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-xs font-semibold text-amber-700">Dati Step 2 non ancora esposti dall&apos;API</p>
      <p className="mt-0.5 text-xs text-amber-600">
        I campi <code className="font-mono">n_prenotazioni_precedenti</code>, <code className="font-mono">segmento_origine</code>,{' '}
        <code className="font-mono">giorni_da_prima_prenotazione</code> e <code className="font-mono">segmenti_precedenti</code> non sono
        inclusi nel payload GET /reviews. Le analisi avanzate (matrice cross, loyalty ranking, istogramma tempo) richiederanno
        un aggiornamento del backend.
      </p>
    </div>
  );
}

// ── Section4Journey ───────────────────────────────────────────────────────────

const Section4Journey = forwardRef(function Section4Journey({ reviews }, ref) {
  const total = reviews.length;

  // Customer pyramid — available fields: prima_prenotazione (bool), cross (bool)
  const pyramid = useMemo(() => {
    if (!total) return [];

    const firstTimers = reviews.filter(r => r.prima_prenotazione === true);
    const returning   = reviews.filter(r => r.prima_prenotazione === false && !r.cross);
    const crossSeg    = reviews.filter(r => r.cross === true);
    const unknown     = reviews.filter(r => r.prima_prenotazione == null && r.cross == null);

    const buckets = [
      { key: 'first',   label: 'Prima prenotazione', arr: firstTimers, color: '#0ea5e9' },
      { key: 'return',  label: 'Ricorrente',          arr: returning,   color: '#0d9488' },
      { key: 'cross',   label: 'Cross-segmento',      arr: crossSeg,    color: '#7c3aed' },
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
    }));
  }, [reviews, total]);

  // Satisfaction by journey type
  const satisfactionTable = useMemo(() => {
    const rows = [
      { label: 'Prima prenotazione', filter: r => r.prima_prenotazione === true },
      { label: 'Ricorrente',         filter: r => r.prima_prenotazione === false && !r.cross },
      { label: 'Cross-segmento',     filter: r => r.cross === true },
    ];

    return rows.map(row => {
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
    });
  }, [reviews, total]);

  // Cross reviews by current segmento
  const crossBySegment = useMemo(() => {
    const crossReviews = reviews.filter(r => r.cross === true);
    if (!crossReviews.length) return [];

    return SEGMENT_ORDER.map(seg => ({
      seg,
      label: SEGMENT_LABELS[seg],
      count: crossReviews.filter(r => r.segmento === seg).length,
      rating: avgRating(crossReviews.filter(r => r.segmento === seg)),
      color: SEGMENT_COLORS[seg],
    })).filter(d => d.count > 0);
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
      subtitle="Tipologia clienti e cross-segmento — campi avanzati in attesa di aggiornamento API"
    >
      <div className="space-y-8">

        <MissingDataNotice />

        {/* ── Row 1: Pyramid + Satisfaction ───────────────────────── */}
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

        {/* ── Cross-segmento per segmento corrente ────────────────── */}
        {crossBySegment.length > 0 && (
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Clienti cross-segmento per segmento attuale</p>
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Segmento</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Cross-clienti</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Rating medio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {crossBySegment.map(row => (
                    <tr key={row.seg} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${SEGMENT_BADGE_CLS[row.seg] || ''}`}>
                          {row.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink">
                        {row.count.toLocaleString('it-IT')}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink">
                        {row.rating > 0 ? row.rating.toFixed(1) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Analisi avanzate non disponibili ────────────────────── */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-sm font-semibold text-neutral-600">Analisi avanzate non disponibili</p>
          <p className="mt-1 text-xs text-neutral-500">
            La matrice Origine→Destinazione, il ranking loyalty e l&apos;istogramma time-to-cross
            richiederanno che il backend esponga i campi{' '}
            <code className="font-mono text-neutral-700">n_prenotazioni_precedenti</code>,{' '}
            <code className="font-mono text-neutral-700">segmento_origine</code> e{' '}
            <code className="font-mono text-neutral-700">giorni_da_prima_prenotazione</code> nel payload GET /reviews.
          </p>
        </div>

      </div>
    </SectionWrapper>
  );
});

export default Section4Journey;
