import { forwardRef, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import SectionWrapper from './shared/SectionWrapper';
import EmptyState from './shared/EmptyState';
import KpiCard from './shared/KpiCard';
import { GRID_COLOR, AXIS_COLOR } from './analytics-constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPO_CFG = {
  generico:        { label: 'Generico',         color: '#7c3aed' },
  topic_specifico: { label: 'Topic specifico',  color: '#0891b2' },
  referral:        { label: 'Referral',         color: '#f97316' },
};

function getTipoLabel(tipo) {
  return TIPO_CFG[tipo]?.label || 'Non categorizzato';
}

function getTipoColor(tipo) {
  return TIPO_CFG[tipo]?.color || '#94a3b8';
}

function formatRate(num, den) {
  if (!den || num === 0) return '0%';
  const ratio = num / den;
  if (ratio < 0.01) return '<1%';
  return `${Math.round(ratio * 100)}%`;
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{getTipoLabel(d.tipo)}</p>
      <p className="text-xs text-neutral-500">
        Risposte: <span className="font-semibold text-ink">{d.count.toLocaleString('it-IT')}</span>
      </p>
      <p className="text-xs text-neutral-500">
        Quota: <span className="font-semibold text-ink">{d.pct}%</span>
      </p>
    </div>
  );
}

function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const nonMod = payload.find(p => p.dataKey === 'nonModificate');
  const mod    = payload.find(p => p.dataKey === 'modificate');
  const tot    = (nonMod?.value || 0) + (mod?.value || 0);
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="mb-1 text-sm font-semibold text-ink">{label}</p>
      <p className="text-xs text-neutral-500">
        Pubblicate: <span className="font-semibold text-ink">{tot}</span>
      </p>
      {nonMod && (
        <p className="text-xs text-neutral-500">
          AI autonoma: <span className="font-semibold text-violet-700">{nonMod.value}</span>
          {tot > 0 && <span className="ml-1 text-neutral-400">({Math.round(nonMod.value / tot * 100)}%)</span>}
        </p>
      )}
      {mod && (
        <p className="text-xs text-neutral-500">
          Modificate da Stefania: <span className="font-semibold text-orange-600">{mod.value}</span>
        </p>
      )}
    </div>
  );
}

// ── Section6AI ────────────────────────────────────────────────────────────────

const Section6AI = forwardRef(function Section6AI({ reviews }, ref) {
  const total = reviews.length;

  // KPI metrics
  const kpis = useMemo(() => {
    if (!total) return null;

    const aiGenerate     = reviews.filter(r => r.risposta_generata != null);
    const pubblicate     = reviews.filter(r => r.risposta_pubblicata != null);
    const modificate     = pubblicate.filter(r => r.risposta_modificata === true);
    const nonModificate  = pubblicate.filter(r => !r.risposta_modificata);

    return {
      aiGenerateCount:    aiGenerate.length,
      pubblicateCount:    pubblicate.length,
      modificateCount:    modificate.length,
      nonModificateCount: nonModificate.length,
    };
  }, [reviews, total]);

  // Donut tipo risposta — basato su risposta_generata
  const donutData = useMemo(() => {
    if (!total) return [];

    const tipoMap = new Map();
    reviews
      .filter(r => r.risposta_generata != null)
      .forEach(r => {
        const tipo = r.tipo_risposta || '__altro__';
        tipoMap.set(tipo, (tipoMap.get(tipo) || 0) + 1);
      });

    const generated = reviews.filter(r => r.risposta_generata != null).length;

    return [...tipoMap.entries()]
      .map(([tipo, count]) => ({
        tipo,
        count,
        pct: generated > 0 ? Math.round(count / generated * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [reviews, total]);

  // Funnel pubblicazione
  const funnelData = useMemo(() => {
    if (!total || !kpis) return [];
    const genPct = total > 0 ? Math.round(kpis.aiGenerateCount / total * 100) : 0;
    const pubPct = kpis.aiGenerateCount > 0
      ? kpis.pubblicateCount / kpis.aiGenerateCount * 100
      : 0;
    return [
      { label: 'Recensioni totali',   count: total,                 pct: 100,   pubRatio: null },
      { label: 'Stefy Agent genera',  count: kpis.aiGenerateCount,  pct: genPct, pubRatio: null },
      { label: 'Risposta pubblicata', count: kpis.pubblicateCount,  pct: genPct, pubRatio: pubPct },
    ];
  }, [total, kpis]);

  // Andamento mensile (ultimi 6 mesi)
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key:          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label:        new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' }).format(d),
        nonModificate: 0,
        modificate:   0,
      });
    }

    reviews
      .filter(r => r.risposta_pubblicata && r.pubblicata_at)
      .forEach(r => {
        const key = r.pubblicata_at.slice(0, 7);
        const b   = buckets.find(m => m.key === key);
        if (!b) return;
        if (r.risposta_modificata) b.modificate++;
        else b.nonModificate++;
      });

    return buckets;
  }, [reviews]);

  const hasMonthlyData = monthlyTrend.some(b => b.nonModificate + b.modificate > 0);

  // Insight banner
  const insightBanner = useMemo(() => {
    if (!kpis || !total) return null;
    const genRate = formatRate(kpis.aiGenerateCount, total);
    const pubRate = formatRate(kpis.pubblicateCount, kpis.aiGenerateCount);
    const pubRatio = kpis.aiGenerateCount > 0
      ? kpis.pubblicateCount / kpis.aiGenerateCount
      : 0;
    if (pubRatio < 0.10) {
      return {
        critical: true,
        text: `Stefy Agent genera risposte per il ${genRate} delle recensioni, ma solo il ${pubRate} viene pubblicato. Collo di bottiglia operativo identificato.`,
      };
    }
    if (pubRatio < 0.50) {
      return {
        critical: false,
        text: `Stefy Agent genera risposte per il ${genRate} delle recensioni, con un tasso di pubblicazione del ${pubRate}.`,
      };
    }
    return null;
  }, [kpis, total]);

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
      subtitle="Stefy Agent vs. intervento umano — generazione e autonomia nel tempo"
    >
      <div className="space-y-8">

        {/* Insight banner */}
        {insightBanner && (
          <div className={`rounded-xl border px-4 py-3 ${
            insightBanner.critical
              ? 'border-red-200 bg-red-50'
              : 'border-amber-200 bg-amber-50'
          }`}>
            <p className={`text-sm font-medium ${
              insightBanner.critical ? 'text-red-700' : 'text-amber-700'
            }`}>
              {insightBanner.text}
            </p>
          </div>
        )}

        {/* KPI cards */}
        {kpis && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Stefy Agent generate"
              value={kpis.aiGenerateCount.toLocaleString('it-IT')}
              subtitle={`${formatRate(kpis.aiGenerateCount, total)} delle recensioni`}
              valueClassName="text-3xl"
            />
            <KpiCard
              label="Pubblicate"
              value={kpis.pubblicateCount.toLocaleString('it-IT')}
              subtitle={kpis.aiGenerateCount > 0
                ? `${formatRate(kpis.pubblicateCount, kpis.aiGenerateCount)} delle generate`
                : '—'}
              valueClassName={`text-3xl ${kpis.pubblicateCount / Math.max(kpis.aiGenerateCount, 1) < 0.10 ? 'text-red-600' : ''}`}
            />
            <KpiCard
              label="Modificate da Stefania"
              value={kpis.pubblicateCount > 0
                ? `${kpis.modificateCount} / ${kpis.pubblicateCount}`
                : '—'}
              subtitle={kpis.pubblicateCount > 0
                ? `${formatRate(kpis.modificateCount, kpis.pubblicateCount)} delle pubblicate`
                : 'Nessuna pubblicata'}
              valueClassName="text-2xl"
            />
            <KpiCard
              label="Autonomia AI"
              value={kpis.pubblicateCount > 0
                ? formatRate(kpis.nonModificateCount, kpis.pubblicateCount)
                : '—'}
              subtitle={kpis.pubblicateCount > 0
                ? `${kpis.nonModificateCount} pubblicate senza modifica`
                : 'Nessuna pubblicata'}
              valueClassName="text-3xl"
            />
          </div>
        )}

        {/* Donut + Funnel */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Tipo risposta Stefy Agent</p>
            {donutData.length > 0 ? (
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
                      <span className="ml-auto text-sm font-semibold text-ink">
                        {d.count.toLocaleString('it-IT')}
                      </span>
                      <span className="w-8 text-right text-xs text-neutral-400">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Nessuna risposta generata nel periodo.</p>
            )}
          </div>

          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Funnel di pubblicazione</p>
            {funnelData.length > 0 ? (
              <div className="space-y-3">
                {funnelData.map((step, i) => {
                  const isCriticalDrop = i === 2 && step.pubRatio != null && step.pubRatio < 0.20;
                  const pctLabel = i === 2
                    ? formatRate(step.count, funnelData[1]?.count || 0)
                    : `${step.pct}%`;
                  return (
                    <div key={step.label}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm text-neutral-700">{step.label}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {step.count.toLocaleString('it-IT')}
                          </span>
                          <span className={`text-xs font-semibold ${
                            isCriticalDrop ? 'text-red-600' : 'text-neutral-500'
                          }`}>
                            {pctLabel}
                          </span>
                        </span>
                      </div>
                      <div className="h-6 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isCriticalDrop ? 'bg-red-500' :
                            i === 1 ? 'bg-violet-500' : 'bg-sky-500'
                          }`}
                          style={{ width: `${step.pct}%` }}
                        />
                      </div>
                      {i < funnelData.length - 1 && (
                        <div className="mt-1 text-right text-xs text-neutral-400">
                          {(() => {
                            const next = funnelData[i + 1];
                            const drop = step.count > 0
                              ? Math.round((step.count - next.count) / step.count * 100)
                              : 0;
                            return drop > 0 ? `-${drop}% al passaggio successivo` : null;
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Andamento mensile autonomia AI */}
        {hasMonthlyData && (
          <div>
            <p className="mb-1 text-sm font-semibold text-neutral-700">Andamento mensile — autonomia Stefy Agent</p>
            <p className="mb-4 text-xs text-neutral-400">
              Barre viola = risposta pubblicata senza modifica (AI autonoma). Arancio = modifica umana.
              Un trend verso il viola indica che l&apos;agente migliora.
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={monthlyTrend}
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip content={<MonthlyTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="nonModificate" stackId="a" fill="#7c3aed" name="AI autonoma" radius={[0, 0, 0, 0]} />
                <Bar dataKey="modificate" stackId="a" fill="#f97316" name="Modificata" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </SectionWrapper>
  );
});

export default Section6AI;
