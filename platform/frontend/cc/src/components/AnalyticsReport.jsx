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
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[16px] border border-neutral-200 bg-neutral-50 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
                Segmenti
              </p>
              <h4 className="mt-2 text-xl font-semibold text-ink">Distribuzione per segmento</h4>
            </div>
            <div className="rounded-[18px] border border-brand-100 bg-white px-4 py-3 text-right shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Totale complessivo</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{totalReviews}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="overflow-x-auto">
              <div className="h-72 min-w-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segmentData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={72}
                    outerRadius={102}
                    paddingAngle={3}
                  >
                    {segmentData.map((entry) => (
                      <Cell key={entry.segmento} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-3">
              {segmentData.map((item) => (
                <div
                  key={item.segmento}
                  className="rounded-[16px] border border-neutral-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-semibold text-ink">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-neutral-600">
                      {item.value} · {formatPercent(item.value, totalReviews)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[16px] border border-brand-100 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_100%)] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
              Cross
            </p>
            <p className="mt-3 text-4xl font-semibold text-ink">{stats?.cross_users || 0}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Utenti che hanno prenotato in più segmenti nel periodo selezionato.
            </p>
          </div>

          <div className="rounded-[16px] border border-emerald-100 bg-[linear-gradient(135deg,_#ecfdf5_0%,_#ffffff_100%)] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Prima prenotazione
            </p>
            <p className="mt-3 text-4xl font-semibold text-ink">{stats?.prima_prenotazione || 0}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Clienti alla prima esperienza registrata nel periodo.
            </p>
          </div>

          <div className="rounded-[16px] border border-neutral-200 bg-white p-5 shadow-sm sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
              Focus
            </p>
            <p className="mt-2 text-lg font-semibold text-ink">Lettura rapida per il team operativo</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Il blocco combina segmenti, volumi tema e segnali di comportamento per leggere il mix di recensioni come un mini report mensile.
            </p>
          </div>
        </div>
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

        <div className="rounded-[16px] border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
            Topic per segmento
          </p>
          <h4 className="mt-2 text-xl font-semibold text-ink">Temi più frequenti per mercato</h4>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Vista comparativa per capire quali argomenti emergono maggiormente in ciascun segmento.
          </p>

          <div className="mt-5 space-y-4">
            {topicRows.map((row) => (
              <div key={row.segmento} className="rounded-[16px] border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: getSegmentColor(row.segmento) }}
                    />
                    <p className="text-sm font-semibold text-ink">{row.label}</p>
                  </div>
                  <span className="text-sm text-neutral-500">{row.total} recensioni</span>
                </div>

                <div className="mt-4 space-y-3">
                  {row.topics.length ? (
                    row.topics.map((topic) => (
                      <div key={`${row.segmento}-${topic.topic}`} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-neutral-700">{getTopicLabel(topic.topic)}</span>
                          <span className="font-semibold text-neutral-500">{topic.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(topic.count / maxTopicRowValue) * 100}%`,
                              backgroundColor: getTopicColor(topic.topic),
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-500">Nessun topic disponibile per questo segmento.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
