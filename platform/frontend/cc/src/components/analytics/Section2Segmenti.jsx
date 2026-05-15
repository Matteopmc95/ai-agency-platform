import { forwardRef, useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import SectionWrapper from './shared/SectionWrapper';
import EmptyState from './shared/EmptyState';
import {
  SEGMENT_COLORS, SEGMENT_BG, SEGMENT_LABELS, SEGMENT_ORDER, SEGMENT_BADGE_CLS,
  VOLUME_COLOR, GRID_COLOR, AXIS_COLOR,
} from './analytics-constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ratingLabel(r) {
  return r > 0 ? r.toFixed(1) : '—';
}

function TrendArrow({ dir }) {
  if (dir === 'up')   return <span className="text-emerald-600 font-bold text-sm">↑</span>;
  if (dir === 'down') return <span className="text-red-500 font-bold text-sm">↓</span>;
  return <span className="text-neutral-400 text-sm">—</span>;
}

// ── Custom Pie Tooltip ────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{SEGMENT_LABELS[d.seg] || d.seg}</p>
      <p className="text-xs text-neutral-500">
        Recensioni: <span className="font-semibold text-ink">{d.count.toLocaleString('it-IT')}</span>
      </p>
      <p className="text-xs text-neutral-500">
        Quota: <span className="font-semibold text-ink">{d.pct}%</span>
      </p>
      <p className="text-xs text-neutral-500">
        Rating medio: <span className="font-semibold text-ink">{ratingLabel(d.rating)}</span>
      </p>
    </div>
  );
}

// ── Custom Bar Tooltip ────────────────────────────────────────────────────────

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{SEGMENT_LABELS[d?.seg] || label}</p>
      <p className="text-xs text-neutral-500">
        Recensioni: <span className="font-semibold text-ink">{d?.count?.toLocaleString('it-IT')}</span>
      </p>
      <p className="text-xs text-neutral-500">
        Rating medio: <span className="font-semibold text-ink">{ratingLabel(d?.rating)}</span>
      </p>
    </div>
  );
}

// ── Section2Segmenti ──────────────────────────────────────────────────────────

const Section2Segmenti = forwardRef(function Section2Segmenti(
  { reviews, filters, onFilter },
  ref
) {
  const [hoveredSeg, setHoveredSeg] = useState(null);

  // Segment stats
  const segStats = useMemo(() => {
    const total = reviews.length;
    const map = {};
    SEGMENT_ORDER.forEach(s => { map[s] = { count: 0, starSum: 0, starCount: 0 }; });

    reviews.forEach(r => {
      const seg = r.segmento;
      if (!map[seg]) return;
      map[seg].count++;
      if (r.stelle) { map[seg].starSum += Number(r.stelle); map[seg].starCount++; }
    });

    return SEGMENT_ORDER.map(seg => ({
      seg,
      label:  SEGMENT_LABELS[seg],
      count:  map[seg].count,
      pct:    total > 0 ? Math.round(map[seg].count / total * 100) : 0,
      rating: map[seg].starCount
        ? Math.round(map[seg].starSum / map[seg].starCount * 10) / 10
        : 0,
    }));
  }, [reviews]);

  // Donut data (only non-zero)
  const donutData = useMemo(
    () => segStats.filter(s => s.count > 0),
    [segStats]
  );

  // Bar chart data (all 4, ordered)
  const barData = useMemo(
    () => segStats.map(s => ({
      ...s,
      fill: SEGMENT_COLORS[s.seg] || '#94a3b8',
      ratingStr: s.rating > 0 ? s.rating.toFixed(1) : '',
    })),
    [segStats]
  );

  // Top 10 locations
  const topLocations = useMemo(() => {
    const midMs = (() => {
      const fromMs = new Date(filters.from).getTime();
      const toMs   = new Date(filters.to + 'T23:59:59').getTime();
      return fromMs + (toMs - fromMs) / 2;
    })();

    const locMap = new Map();
    reviews.forEach(r => {
      const loc = (r.localita || '').trim();
      if (!loc) return; // esclude review senza localita valida
      if (!locMap.has(loc)) {
        locMap.set(loc, { loc, seg: r.segmento, count: 0, starSum: 0, starCount: 0,
          earlyStarSum: 0, earlyStarCount: 0, lateStarSum: 0, lateStarCount: 0 });
      }
      const b = locMap.get(loc);
      b.count++;
      if (r.stelle) {
        const stars = Number(r.stelle);
        b.starSum += stars;
        b.starCount++;
        const t = r.data ? new Date(r.data).getTime() : 0;
        if (t && t < midMs) { b.earlyStarSum += stars; b.earlyStarCount++; }
        else if (t)          { b.lateStarSum  += stars; b.lateStarCount++;  }
      }
    });

    return [...locMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(l => {
        const rating     = l.starCount     ? Math.round(l.starSum     / l.starCount     * 10) / 10 : 0;
        const earlyRating = l.earlyStarCount ? l.earlyStarSum / l.earlyStarCount : 0;
        const lateRating  = l.lateStarCount  ? l.lateStarSum  / l.lateStarCount  : 0;
        const trend = (l.earlyStarCount > 0 && l.lateStarCount > 0)
          ? (lateRating - earlyRating > 0.1 ? 'up' : lateRating - earlyRating < -0.1 ? 'down' : 'flat')
          : 'flat';
        return { ...l, rating, trend };
      });
  }, [reviews, filters.from, filters.to]);

  function toggleSeg(seg) {
    const current = filters.segmenti || [];
    const next = current.includes(seg)
      ? current.filter(s => s !== seg)
      : [...current, seg];
    onFilter({ segmenti: next });
  }

  if (!reviews.length) {
    return (
      <SectionWrapper ref={ref} id="s2" label="Segmenti & Location" title="Segmenti & Location">
        <EmptyState message="Nessuna recensione nel periodo selezionato." />
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper
      ref={ref}
      id="s2"
      label="Segmenti & Location"
      title="Segmenti & Location"
      subtitle="Distribuzione per segmento e performance delle location"
    >
      <div className="space-y-8">

        {/* ── Row 1: Donut + Bar ───────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Donut segmenti */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Distribuzione segmenti</p>
            <div className="flex items-center gap-6">
              <div className="h-52 w-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="count"
                      stroke="none"
                      strokeWidth={0}
                      onClick={d => toggleSeg(d.seg)}
                      onMouseEnter={d => setHoveredSeg(d.seg)}
                      onMouseLeave={() => setHoveredSeg(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      {donutData.map(d => {
                        const isActive = (filters.segmenti || []).includes(d.seg);
                        return (
                          <Cell
                            key={d.seg}
                            fill={SEGMENT_COLORS[d.seg]}
                            stroke="none"
                            strokeWidth={0}
                            opacity={
                              hoveredSeg && hoveredSeg !== d.seg ? 0.4 :
                              !isActive && (filters.segmenti || []).length > 0 ? 0.45 :
                              1
                            }
                          />
                        );
                      })}
                    </Pie>
                    <PieTooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="space-y-2">
                {donutData.map(d => (
                  <button
                    key={d.seg}
                    type="button"
                    onClick={() => toggleSeg(d.seg)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-neutral-50"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: SEGMENT_COLORS[d.seg] }}
                    />
                    <span className="text-sm font-medium text-neutral-700">{d.label}</span>
                    <span className="ml-auto text-sm font-semibold text-ink">{d.count.toLocaleString('it-IT')}</span>
                    <span className="w-8 text-right text-xs text-neutral-400">{d.pct}%</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bar performance per segmento */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Performance per segmento</p>
            <ResponsiveContainer width="100%" height={208}>
              <BarChart
                data={barData}
                margin={{ top: 20, right: 16, left: 0, bottom: 0 }}
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
                <Tooltip content={<BarTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  name="Recensioni"
                >
                  {barData.map(d => (
                    <Cell key={d.seg} fill={SEGMENT_COLORS[d.seg] || VOLUME_COLOR} />
                  ))}
                  <LabelList
                    dataKey="ratingStr"
                    position="top"
                    style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Row 2: Top 10 Locations ──────────────────────────────── */}
        <div>
          <p className="mb-4 text-sm font-semibold text-neutral-700">Top 10 Location per volume</p>
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Segmento</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Recensioni</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Rating</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {topLocations.map((l, i) => {
                  const lowRating = l.rating > 0 && l.rating < 3.5;
                  return (
                    <tr
                      key={l.loc}
                      className={[
                        'transition',
                        lowRating ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-neutral-50',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3 font-medium text-ink">
                        <span className="mr-2 text-xs text-neutral-400">{i + 1}.</span>
                        {l.loc}
                      </td>
                      <td className="px-4 py-3">
                        {l.seg ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${SEGMENT_BADGE_CLS[l.seg] || ''}`}>
                            {SEGMENT_LABELS[l.seg] || l.seg}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        {l.count.toLocaleString('it-IT')}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${lowRating ? 'text-red-600' : 'text-ink'}`}>
                        {ratingLabel(l.rating)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <TrendArrow dir={l.trend} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </SectionWrapper>
  );
});

export default Section2Segmenti;
