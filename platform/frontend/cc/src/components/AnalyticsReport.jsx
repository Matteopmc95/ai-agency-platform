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
      <div className="rounded-[16px] border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-500">
        Dati cross-selling, prima prenotazione e distribuzione per segmento non disponibili — integrazione backoffice in corso.
      </div>

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
