import { forwardRef, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import SectionWrapper from './shared/SectionWrapper';
import EmptyState from './shared/EmptyState';
import {
  TOPIC_CATALOG, TOPIC_COLORS, TOPIC_LABELS,
  SEGMENT_ORDER, SEGMENT_LABELS, SEGMENT_COLORS,
  GRID_COLOR, AXIS_COLOR,
} from './analytics-constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function interpolateToWhite(hex, t) {
  // t=0 → white, t=1 → hex
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const ri = Math.round(255 + (r - 255) * t);
  const gi = Math.round(255 + (g - 255) * t);
  const bi = Math.round(255 + (b - 255) * t);
  return `rgb(${ri},${gi},${bi})`;
}

function TopicTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{d.label}</p>
      <p className="text-xs text-neutral-500">
        Citazioni: <span className="font-semibold text-ink">{d.count.toLocaleString('it-IT')}</span>
      </p>
      <p className="text-xs text-neutral-500">
        Rating medio: <span className="font-semibold text-ink">
          {d.rating > 0 ? d.rating.toFixed(1) : '—'}
        </span>
      </p>
    </div>
  );
}

// ── Section3Topics ────────────────────────────────────────────────────────────

const Section3Topics = forwardRef(function Section3Topics({ reviews }, ref) {
  // Topic stats: count + avg rating per topic
  const topicStats = useMemo(() => {
    const map = new Map();
    TOPIC_CATALOG.forEach(t => map.set(t, { count: 0, starSum: 0, starCount: 0 }));

    reviews.forEach(r => {
      (r.topics || []).forEach(t => {
        if (!map.has(t)) return;
        const b = map.get(t);
        b.count++;
        if (r.stelle) { b.starSum += Number(r.stelle); b.starCount++; }
      });
    });

    return TOPIC_CATALOG.map(t => {
      const b = map.get(t);
      return {
        topic:  t,
        label:  TOPIC_LABELS[t] || t,
        count:  b.count,
        rating: b.starCount ? Math.round(b.starSum / b.starCount * 10) / 10 : 0,
        color:  TOPIC_COLORS[t] || '#94a3b8',
      };
    }).sort((a, b) => b.count - a.count);
  }, [reviews]);

  // Topic × Segmento heatmap matrix
  const heatmap = useMemo(() => {
    // map[topic][seg] = count
    const matrix = {};
    TOPIC_CATALOG.forEach(t => {
      matrix[t] = {};
      SEGMENT_ORDER.forEach(s => { matrix[t][s] = 0; });
    });

    reviews.forEach(r => {
      const seg = r.segmento;
      if (!SEGMENT_ORDER.includes(seg)) return;
      (r.topics || []).forEach(t => {
        if (matrix[t]) matrix[t][seg]++;
      });
    });

    // Max per cell for color scaling
    let maxVal = 1;
    TOPIC_CATALOG.forEach(t => {
      SEGMENT_ORDER.forEach(s => {
        if (matrix[t][s] > maxVal) maxVal = matrix[t][s];
      });
    });

    return { matrix, maxVal };
  }, [reviews]);

  // 4 insight cards
  const insights = useMemo(() => {
    const withCount = topicStats.filter(t => t.count > 0);
    if (!withCount.length) return [];

    const topVolume  = withCount[0];
    const topRating  = [...withCount].sort((a, b) => b.rating - a.rating)[0];
    const lowRating  = [...withCount].filter(t => t.rating > 0).sort((a, b) => a.rating - b.rating)[0];

    // Topic con piu risposte proporzionalmente
    const responseMap = new Map();
    TOPIC_CATALOG.forEach(t => responseMap.set(t, { withResp: 0, total: 0 }));
    reviews.forEach(r => {
      (r.topics || []).forEach(t => {
        if (!responseMap.has(t)) return;
        const b = responseMap.get(t);
        b.total++;
        if (r.risposta_pubblicata) b.withResp++;
      });
    });
    const topResponse = TOPIC_CATALOG
      .map(t => {
        const b = responseMap.get(t);
        return { topic: t, label: TOPIC_LABELS[t] || t, rate: b.total > 5 ? Math.round(b.withResp / b.total * 100) : 0, total: b.total };
      })
      .filter(t => t.total > 5)
      .sort((a, b) => b.rate - a.rate)[0];

    return [
      { title: 'Topic piu frequente', value: topVolume.label, sub: `${topVolume.count.toLocaleString('it-IT')} citazioni`, color: topVolume.color },
      { title: 'Miglior sentiment',   value: topRating.label,  sub: `${topRating.rating.toFixed(1)} stelle medie`,           color: '#16a34a' },
      { title: 'Sentiment critico',   value: lowRating ? lowRating.label : '—', sub: lowRating ? `${lowRating.rating.toFixed(1)} stelle medie` : '', color: '#dc2626' },
      { title: 'Tasso risposta top',  value: topResponse ? topResponse.label : '—', sub: topResponse ? `${topResponse.rate}% con risposta` : '', color: '#0891b2' },
    ];
  }, [topicStats, reviews]);

  if (!reviews.length) {
    return (
      <SectionWrapper ref={ref} id="s3" label="Topic Analysis" title="Topic Analysis">
        <EmptyState message="Nessuna recensione nel periodo selezionato." />
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper
      ref={ref}
      id="s3"
      label="Topic Analysis"
      title="Topic Analysis"
      subtitle="Volume e sentiment per ogni argomento menzionato nelle recensioni"
    >
      <div className="space-y-8">

        {/* ── Insight cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {insights.map(ins => (
            <div
              key={ins.title}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{ins.title}</p>
              <p
                className="mt-2 text-lg font-semibold leading-tight"
                style={{ color: ins.color }}
              >
                {ins.value}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">{ins.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Horizontal bar chart ────────────────────────────────── */}
        <div>
          <p className="mb-4 text-sm font-semibold text-neutral-700">Volume per topic</p>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              layout="vertical"
              data={topicStats}
              margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
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
                width={110}
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TopicTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} name="Citazioni">
                {topicStats.map(d => (
                  <Cell key={d.topic} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Heatmap Topic × Segmento ────────────────────────────── */}
        <div>
          <p className="mb-4 text-sm font-semibold text-neutral-700">Distribuzione Topic per Segmento</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="w-32 py-2 pr-3 text-left text-xs font-semibold text-neutral-500">Topic</th>
                  {SEGMENT_ORDER.map(seg => (
                    <th
                      key={seg}
                      className="px-2 py-2 text-center text-xs font-semibold"
                      style={{ color: SEGMENT_COLORS[seg] }}
                    >
                      {SEGMENT_LABELS[seg]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOPIC_CATALOG.map(topic => (
                  <tr key={topic}>
                    <td className="py-1 pr-3 text-left font-medium text-neutral-600">
                      {TOPIC_LABELS[topic] || topic}
                    </td>
                    {SEGMENT_ORDER.map(seg => {
                      const val = heatmap.matrix[topic][seg];
                      const intensity = heatmap.maxVal > 0 ? val / heatmap.maxVal : 0;
                      const bg = interpolateToWhite(
                        SEGMENT_COLORS[seg] || '#94a3b8',
                        Math.min(intensity * 1.5, 1)
                      );
                      return (
                        <td
                          key={seg}
                          className="px-2 py-1 text-center font-semibold"
                          style={{
                            backgroundColor: bg,
                            color: intensity > 0.5 ? '#fff' : '#374151',
                            borderRadius: 6,
                          }}
                        >
                          {val > 0 ? val : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </SectionWrapper>
  );
});

export default Section3Topics;
