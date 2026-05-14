import { forwardRef, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import SectionWrapper from './shared/SectionWrapper';
import EmptyState from './shared/EmptyState';
import KpiCard from './shared/KpiCard';
import {
  TOPIC_LABELS, TOPIC_COLORS, TOPIC_CATALOG,
  GRID_COLOR, AXIS_COLOR,
} from './analytics-constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPO_CFG = {
  ai:       { label: 'AI generata',  color: '#7c3aed' },
  manuale:  { label: 'Manuale',      color: '#0891b2' },
  nessuna:  { label: 'Senza risposta', color: '#e2e8f0' },
};

function getTipoLabel(tipo) {
  return TIPO_CFG[tipo]?.label || tipo || 'Altro';
}

function getTipoColor(tipo) {
  return TIPO_CFG[tipo]?.color || '#94a3b8';
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{getTipoLabel(d.tipo)}</p>
      <p className="text-xs text-neutral-500">
        Recensioni: <span className="font-semibold text-ink">{d.count.toLocaleString('it-IT')}</span>
      </p>
      <p className="text-xs text-neutral-500">
        Quota: <span className="font-semibold text-ink">{d.pct}%</span>
      </p>
    </div>
  );
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <p className="text-xs text-neutral-500">
        Risposte: <span className="font-semibold text-ink">{payload[0]?.value}</span>
      </p>
    </div>
  );
}

// ── Section6AI ────────────────────────────────────────────────────────────────

const Section6AI = forwardRef(function Section6AI({ reviews }, ref) {
  const total = reviews.length;

  // KPI metrics
  const kpis = useMemo(() => {
    if (!total) return null;

    const withResp = reviews.filter(r => r.risposta_pubblicata);
    const responseRate = Math.round(withResp.length / total * 100);

    const aiResp     = withResp.filter(r => r.tipo_risposta === 'ai');
    const manualResp = withResp.filter(r => r.tipo_risposta === 'manuale' || (r.risposta_pubblicata && !r.tipo_risposta));

    const aiRate     = withResp.length ? Math.round(aiResp.length     / withResp.length * 100) : 0;
    const manualRate = withResp.length ? Math.round(manualResp.length / withResp.length * 100) : 0;

    const noResp     = reviews.filter(r => !r.risposta_pubblicata).length;

    return {
      responseRate,
      responseCount: withResp.length,
      aiRate,
      aiCount: aiResp.length,
      manualRate,
      manualCount: manualResp.length,
      noResp,
    };
  }, [reviews, total]);

  // Tipo risposta donut
  const donutData = useMemo(() => {
    if (!total) return [];

    const tipoMap = new Map();
    reviews.forEach(r => {
      const tipo = r.risposta_pubblicata
        ? (r.tipo_risposta || 'manuale')
        : 'nessuna';
      tipoMap.set(tipo, (tipoMap.get(tipo) || 0) + 1);
    });

    return [...tipoMap.entries()]
      .map(([tipo, count]) => ({
        tipo,
        count,
        pct: Math.round(count / total * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [reviews, total]);

  // Topic breakdown for reviewed (with response) reviews
  const topicBarData = useMemo(() => {
    const withResp = reviews.filter(r => r.risposta_pubblicata);
    if (!withResp.length) return [];

    const map = new Map();
    TOPIC_CATALOG.forEach(t => map.set(t, 0));
    withResp.forEach(r => {
      (r.topics || []).forEach(t => {
        if (map.has(t)) map.set(t, map.get(t) + 1);
      });
    });

    return TOPIC_CATALOG
      .map(t => ({ topic: t, label: TOPIC_LABELS[t] || t, count: map.get(t), color: TOPIC_COLORS[t] || '#94a3b8' }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [reviews]);

  if (!total) {
    return (
      <SectionWrapper ref={ref} id="s6" label="AI & Risposte" title="AI & Risposte">
        <EmptyState message="Nessuna recensione nel periodo selezionato." />
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper
      ref={ref}
      id="s6"
      label="AI & Risposte"
      title="AI & Risposte"
      subtitle="Copertura e tipologia delle risposte pubblicate"
    >
      <div className="space-y-8">

        {/* ── KPI cards ───────────────────────────────────────────── */}
        {kpis && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Tasso risposta"
              value={`${kpis.responseRate}%`}
              subtitle={`${kpis.responseCount.toLocaleString('it-IT')} su ${total.toLocaleString('it-IT')}`}
              valueClassName="text-3xl"
            />
            <KpiCard
              label="Risposte AI"
              value={`${kpis.aiCount.toLocaleString('it-IT')}`}
              subtitle={`${kpis.aiRate}% delle risposte`}
              valueClassName="text-3xl"
            />
            <KpiCard
              label="Risposte manuali"
              value={`${kpis.manualCount.toLocaleString('it-IT')}`}
              subtitle={`${kpis.manualRate}% delle risposte`}
              valueClassName="text-3xl"
            />
            <KpiCard
              label="Senza risposta"
              value={`${kpis.noResp.toLocaleString('it-IT')}`}
              subtitle={`${Math.round(kpis.noResp / total * 100)}% del totale`}
              valueClassName="text-3xl"
            />
          </div>
        )}

        {/* ── Donut + Topic bar ────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Donut tipo risposta */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Tipo risposta</p>
            <div className="flex items-center gap-6">
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={84}
                      paddingAngle={2}
                      dataKey="count"
                    >
                      {donutData.map(d => (
                        <Cell key={d.tipo} fill={getTipoColor(d.tipo)} />
                      ))}
                    </Pie>
                    <PieTooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {donutData.map(d => (
                  <div key={d.tipo} className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: getTipoColor(d.tipo) }}
                    />
                    <span className="text-sm text-neutral-700">{getTipoLabel(d.tipo)}</span>
                    <span className="ml-auto text-sm font-semibold text-ink">{d.count.toLocaleString('it-IT')}</span>
                    <span className="w-8 text-right text-xs text-neutral-400">{d.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Topic breakdown delle risposte */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Topic nelle recensioni con risposta</p>
            {topicBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  layout="vertical"
                  data={topicBarData}
                  margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: AXIS_COLOR }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={100}
                    tick={{ fontSize: 11, fill: '#374151' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16} name="Risposte">
                    {topicBarData.map(d => (
                      <Cell key={d.topic} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-neutral-400">Nessuna recensione con risposta nel periodo.</p>
            )}
          </div>
        </div>

      </div>
    </SectionWrapper>
  );
});

export default Section6AI;
