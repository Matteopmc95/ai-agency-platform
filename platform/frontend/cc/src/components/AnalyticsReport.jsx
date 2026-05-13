import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import SectionCard from './SectionCard';
import {
  formatPercent,
  getSegmentColor,
  getSegmentLabel,
  getTopicColor,
  getTopicLabel,
  topicCatalog,
} from '../lib/utils';

const periodOptions = [
  { value: 'month', label: 'Ultimo mese' },
  { value: '3months', label: 'Ultimi 3 mesi' },
  { value: 'all', label: 'Tutto' },
];

const segmentOrder = ['airport', 'port', 'station', 'city'];

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{item.label || item.topic || item.segmento}</p>
      <p className="mt-1 text-sm text-neutral-500">
        {item.value ?? item.count} recensioni
      </p>
    </div>
  );
}

export default function AnalyticsReport({
  stats,
  topicsBySegment,
  selectedPeriod,
  onPeriodChange,
  filterSegmento = '',
  filterEnrichment = '',
}) {
  const segmentCounts = new Map((stats?.per_segment || []).map((item) => [item.segmento, item.count]));
  const totalReviews = stats?.total_reviews || 0;

  const segmentData = segmentOrder.map((segmento) => ({
    segmento,
    label: getSegmentLabel(segmento),
    value: segmentCounts.get(segmento) || 0,
    color: getSegmentColor(segmento),
  }));

  const topicCounts = new Map(
    (stats?.top_topic || []).map((item) => [item.topic?.trim().toLowerCase(), item.count])
  );

  const topicData = topicCatalog.map((topic) => ({
    topic,
    label: getTopicLabel(topic),
    value: topicCounts.get(topic) || 0,
    color: getTopicColor(topic),
  }));

  const topicRows = segmentOrder.map((segmento) => {
    const match = (topicsBySegment?.by_segment || []).find((item) => item.segmento === segmento);
    return {
      segmento,
      label: getSegmentLabel(segmento),
      total: match?.totale || 0,
      topics: (match?.topics || []).slice(0, 4),
    };
  });

  const maxTopicRowValue = Math.max(
    ...topicRows.flatMap((row) => row.topics.map((topic) => topic.count)),
    1
  );

  return (
    <SectionCard
      eyebrow="Analytics"
      title="Andamento recensioni"
      description="Una lettura chiara per segmento, topic e segnali di comportamento."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPeriodChange(option.value)}
              className={[
                'rounded-full border px-4 py-2 text-sm font-semibold transition',
                selectedPeriod === option.value
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
      contentClassName="space-y-6"
    >
      {/* ── Insight BO ── */}
      {(() => {
        const perSeg     = stats?.per_segment || [];
        const total      = stats?.total_reviews || 0;
        const crossN     = stats?.cross_users || 0;
        const primaN     = stats?.prima_prenotazione || 0;
        const hasBoData  = perSeg.some(s => s.count > 0);

        // Filtra segmento se selezionato
        const segRows = filterSegmento
          ? perSeg.filter(s => s.segmento === filterSegmento)
          : perSeg;

        if (!hasBoData) return (
          <div className="rounded-[16px] border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-500">
            Dati BO non ancora disponibili — in attesa del backfill delle recensioni.
          </div>
        );

        const SEG_LABELS = { airport: 'Airport', port: 'Port', city: 'City', station: 'Station' };

        return (
          <div className="rounded-[16px] border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">Insight BO</p>
            <h4 className="mt-2 text-xl font-semibold text-ink">Dati prenotazione</h4>
            <p className="mt-1 text-sm text-neutral-500">Calcolati sulle recensioni con dati BO (matched).</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Distribuzione segmenti */}
              {segRows.map(s => (
                <div key={s.segmento} className="rounded-[12px] border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">{SEG_LABELS[s.segmento] || s.segmento}</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{s.count}</p>
                  <p className="mt-1 text-xs text-neutral-500">{total > 0 ? `${((s.count / total) * 100).toFixed(1)}%` : '—'}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[12px] border border-neutral-100 bg-neutral-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Cross-segmento</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{crossN}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {total > 0 ? `${((crossN / total) * 100).toFixed(1)}% sul totale` : '—'}
                </p>
              </div>
              <div className="rounded-[12px] border border-neutral-100 bg-neutral-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Prima prenotazione</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{primaN}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {total > 0 ? `${((primaN / total) * 100).toFixed(1)}% sul totale` : '—'}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[16px] border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">Topic</p>
          <h4 className="mt-2 text-xl font-semibold text-ink">Distribuzione topic</h4>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Conteggio complessivo per ciascun tema monitorato nella dashboard.
          </p>

          <div className="mt-5 overflow-x-auto">
            <div className="h-[440px] min-w-[640px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topicData} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 24 }}>
                <CartesianGrid stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#737373', fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={150}
                  tick={{ fill: '#171717', fontSize: 12 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                  {topicData.map((entry) => (
                    <Cell key={entry.topic} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
    </SectionCard>
  );
}
