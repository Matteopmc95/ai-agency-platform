import { forwardRef, useMemo } from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import KpiCard from './shared/KpiCard';
import SectionWrapper from './shared/SectionWrapper';
import EmptyState from './shared/EmptyState';
import { getTopicLabel } from '../../lib/utils';

// ── Date bucketing ────────────────────────────────────────────────────────────

function daysBetween(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86_400_000) + 1;
}

function getGranularity(from, to) {
  const d = daysBetween(from, to);
  if (d <= 31)  return 'day';
  if (d <= 180) return 'week';
  return 'month';
}

function getBucketKey(dateStr, granularity) {
  if (granularity === 'month') return dateStr.slice(0, 7);
  if (granularity === 'week') {
    const d = new Date(dateStr.slice(0, 10) + 'T12:00:00Z');
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  }
  return dateStr.slice(0, 10);
}

function formatBucketLabel(key, granularity) {
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' }).format(
      new Date(y, m - 1)
    );
  }
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(
    new Date(key + 'T12:00:00Z')
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function VolumeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-ink">{label}</p>
      <p className="text-xs text-neutral-500">
        Recensioni: <span className="font-semibold text-ink">{d.count}</span>
      </p>
      {d.trustpilot > 0 && <p className="mt-1 text-xs text-emerald-700">Trustpilot: {d.trustpilot}</p>}
      {d.apple      > 0 && <p className="text-xs text-neutral-600">iOS: {d.apple}</p>}
      {d.playstore  > 0 && <p className="text-xs text-blue-700">Android: {d.playstore}</p>}
      {d.gmb        > 0 && <p className="text-xs text-red-700">Google: {d.gmb}</p>}
    </div>
  );
}

function RatingTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (d.rating == null) return null;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="mb-1 text-sm font-semibold text-ink">{label}</p>
      <p className="text-xs text-neutral-500">
        Rating medio: <span className="font-semibold text-ink">{d.rating.toFixed(1)}</span>
      </p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function formatRate(num, den) {
  if (!den || num === 0) return '0%';
  const ratio = num / den;
  if (ratio < 0.01) return '<1%';
  return `${Math.round(ratio * 100)}%`;
}

function applyNonDateFilters(reviews, filters) {
  return reviews.filter(r => {
    if (filters.segmenti.length  && !filters.segmenti.includes(r.segmento))          return false;
    if (filters.sources.length   && !filters.sources.includes(r.source))             return false;
    if (filters.stelle.length    && !filters.stelle.includes(Number(r.stelle)))      return false;
    if (filters.topics.length    && !filters.topics.some(t => (r.topic || []).includes(t))) return false;
    if (filters.status === 'matched' && r.enrichment_status !== 'matched')     return false;
    if (filters.status === 'pending' && r.enrichment_status !== 'pending_sync') return false;
    if (filters.customer === 'new'        && !r.prima_prenotazione)  return false;
    if (filters.customer === 'returning'  && r.prima_prenotazione)   return false;
    if (filters.customer === 'cross2'     && !r.cross)               return false;
    if (filters.customer === 'cross3plus' && !r.cross)               return false;
    return true;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

const Section1Overview = forwardRef(function Section1Overview(
  { reviews, allReviews, filters },
  ref
) {
  // Previous period (same duration, immediately before)
  const previousReviews = useMemo(() => {
    const fromMs = new Date(filters.from).getTime();
    const toMs   = new Date(filters.to).getTime();
    const durMs  = toMs - fromMs + 86_400_000;
    const prevFrom = new Date(fromMs - durMs).toISOString().slice(0, 10);
    const prevTo   = new Date(fromMs - 86_400_000).toISOString().slice(0, 10) + 'T23:59:59';

    return applyNonDateFilters(
      allReviews.filter(r => r.data && r.data >= prevFrom && r.data <= prevTo),
      filters
    );
  }, [allReviews, filters]);

  // KPI calculations
  const kpis = useMemo(() => {
    const total     = reviews.length;
    const prevTotal = previousReviews.length;

    const rated     = reviews.filter(r => r.stelle).map(r => Number(r.stelle));
    const prevRated = previousReviews.filter(r => r.stelle).map(r => Number(r.stelle));
    const avgRating     = avg(rated);
    const prevAvgRating = avg(prevRated);

    const count5  = reviews.filter(r => Number(r.stelle) === 5).length;
    const count12 = reviews.filter(r => [1, 2].includes(Number(r.stelle))).length;
    const satisfactionScore = total ? Math.round((count5 - count12) / total * 100) : 0;

    const responseCount = reviews.filter(r => r.risposta_pubblicata).length;
    const responseRate  = formatRate(responseCount, total);

    const topicMap = new Map();
    reviews.forEach(r => (r.topic || []).forEach(t => topicMap.set(t, (topicMap.get(t) || 0) + 1)));
    const topEntry = [...topicMap.entries()].sort((a, b) => b[1] - a[1])[0];

    const loyalCount = reviews.filter(r => !r.prima_prenotazione).length;
    const loyaltyRate = total ? Math.round(loyalCount / total * 100) : 0;

    const rawDelta     = prevTotal >= 30 ? Math.round((total - prevTotal) / prevTotal * 100) : null;
    const totalDelta   = rawDelta != null && Math.abs(rawDelta) > 500 ? null : rawDelta;
    const ratingDelta  = prevAvgRating > 0
      ? Math.round((avgRating - prevAvgRating) * 10) / 10
      : null;

    return {
      total, prevTotal, totalDelta,
      avgRating:          avgRating > 0 ? avgRating.toFixed(1) : '—',
      ratingDelta,
      satisfactionScore,
      responseRate,
      topTopic: topEntry ? { label: getTopicLabel(topEntry[0]), count: topEntry[1] } : null,
      loyaltyRate,
    };
  }, [reviews, previousReviews]);

  // Trend data
  const trendData = useMemo(() => {
    if (!reviews.length) return [];
    const granularity = getGranularity(filters.from, filters.to);
    const map = new Map();

    reviews.forEach(r => {
      if (!r.data) return;
      const key = getBucketKey(r.data, granularity);
      if (!map.has(key)) {
        map.set(key, { count: 0, starSum: 0, starCount: 0,
          trustpilot: 0, apple: 0, playstore: 0, gmb: 0 });
      }
      const b = map.get(key);
      b.count++;
      if (r.stelle) { b.starSum += Number(r.stelle); b.starCount++; }
      if (r.source && r.source in b) b[r.source]++;
    });

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, b]) => b.count > 0)
      .map(([key, b]) => ({
        label:      formatBucketLabel(key, granularity),
        count:      b.count,
        rating:     b.starCount ? Math.round(b.starSum / b.starCount * 10) / 10 : null,
        trustpilot: b.trustpilot,
        apple:      b.apple,
        playstore:  b.playstore,
        gmb:        b.gmb,
      }));
  }, [reviews, filters.from, filters.to]);

  if (!reviews.length) {
    return (
      <SectionWrapper ref={ref} id="s1" label="Overview" title="Panoramica generale">
        <EmptyState message="Nessuna recensione nel periodo selezionato." />
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper
      ref={ref}
      id="s1"
      label="Overview"
      title="Panoramica generale"
      subtitle="KPI principali e andamento nel periodo selezionato"
    >
      <div className="space-y-8">

        {/* ── KPI cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Recensioni"
            value={kpis.total.toLocaleString('it-IT')}
            subtitle={kpis.prevTotal > 0 ? `vs ${kpis.prevTotal.toLocaleString('it-IT')} periodo prec.` : undefined}
            delta={kpis.totalDelta}
            deltaLabel="%"
          />
          <KpiCard
            label="Rating Medio"
            value={kpis.avgRating}
            subtitle="su 5 stelle"
            delta={kpis.ratingDelta}
            deltaLabel="pt"
          />
          <KpiCard
            label="Score Soddisfazione"
            value={`${kpis.satisfactionScore > 0 ? '+' : ''}${kpis.satisfactionScore}%`}
          />
          <KpiCard
            label="Tasso Risposta"
            value={kpis.responseRate}
            subtitle="con risposta pubblicata"
          />
          <KpiCard
            label="Topic piu citato"
            value={kpis.topTopic?.label ?? '—'}
            subtitle={kpis.topTopic ? `${kpis.topTopic.count} citazioni` : undefined}
            valueClassName="text-2xl"
          />
          <KpiCard
            label="Customer Loyalty"
            value={`${kpis.loyaltyRate}%`}
            subtitle={`su ${kpis.total.toLocaleString('it-IT')} recensioni totali`}
          />
        </div>

        {/* ── Trend charts ──────────────────────────────────────────── */}
        {trendData.length > 1 ? (
          <div className="space-y-6">

            {/* Chart 1 — Volume */}
            <div>
              <p className="mb-3 text-sm font-semibold text-neutral-700">Volume recensioni</p>
              <ResponsiveContainer width="100%" height={224}>
                <BarChart
                  data={trendData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 'auto']}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip content={<VolumeTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar
                    dataKey="count"
                    fill="#0E978D"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                    name="Recensioni"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2 — Rating */}
            <div>
              <p className="mb-3 text-sm font-semibold text-neutral-700">Rating medio</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart
                  data={trendData}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[3, 5]}
                    ticks={[3, 3.5, 4, 4.5, 5]}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip content={<RatingTooltip />} cursor={{ stroke: '#e2e8f0' }} />
                  <Line
                    dataKey="rating"
                    stroke="#FF8300"
                    strokeWidth={2.5}
                    dot={{ fill: '#FF8300', r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    name="Rating medio"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            Dati insufficienti per visualizzare l&apos;andamento.
          </p>
        )}

      </div>
    </SectionWrapper>
  );
});

export default Section1Overview;
