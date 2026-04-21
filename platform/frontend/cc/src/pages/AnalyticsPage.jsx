import { useEffect, useState } from 'react';
import AnalyticsReport from '../components/AnalyticsReport';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import ReviewRow from '../components/ReviewRow';
import { HorizontalBarChart } from '../components/Charts';
import { fetchReviews, fetchStats, fetchTopicsBySegment, getErrorMessage } from '../lib/api';
import { getStarDistribution } from '../lib/utils';

const tabs = [
  { key: 'trustpilot', label: 'Trustpilot' },
  { key: 'google', label: 'Google My Business' },
  { key: 'apple', label: 'iOS App Store' },
  { key: 'playstore', label: 'Android Play Store' },
];

function PlaceholderPanel({ title, description, accentClassName }) {
  return (
    <section className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className={`rounded-[20px] border p-8 sm:p-10 ${accentClassName}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Integrazione</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-600">{description}</p>
      </div>
    </section>
  );
}

export default function AnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState('trustpilot');
  const [trustpilotStats, setTrustpilotStats] = useState(null);
  const [trustpilotTopics, setTrustpilotTopics] = useState(null);
  const [playstoreStats, setPlaystoreStats] = useState(null);
  const [playstoreReviews, setPlaystoreReviews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setLoading(true);
        setError('');

        const [trustStatsData, trustTopicsData, androidStatsData, androidReviewsData] = await Promise.all([
          fetchStats({ period: selectedPeriod, source: 'trustpilot' }),
          fetchTopicsBySegment({ period: selectedPeriod, source: 'trustpilot' }),
          fetchStats({ period: selectedPeriod, source: 'playstore' }),
          fetchReviews({ source: 'playstore', limit: 6, offset: 0 }),
        ]);

        setTrustpilotStats(trustStatsData);
        setTrustpilotTopics(trustTopicsData);
        setPlaystoreStats(androidStatsData);
        setPlaystoreReviews(androidReviewsData);
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Impossibile caricare i dati, riprova.'));
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, [selectedPeriod]);

  if (loading) {
    return <LoadingState label="Sto preparando l'andamento recensioni..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  const playstoreStars = getStarDistribution(playstoreStats).map((item) => ({
    ...item,
    color: item.stars >= 4 ? '#65A30D' : item.stars === 3 ? '#F59E0B' : '#2563EB',
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-600">Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
          Andamento recensioni per fonte
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Naviga i dati per canale: Trustpilot è già operativo, mentre GMB e iOS sono pronti per la prossima integrazione.
        </p>
      </section>

      <section className="rounded-[24px] border border-neutral-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                'rounded-full px-4 py-2.5 text-sm font-semibold transition',
                activeTab === tab.key
                  ? 'bg-ink text-white shadow-sm'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-brand-50 hover:text-brand-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'trustpilot' ? (
        <AnalyticsReport
          stats={trustpilotStats}
          topicsBySegment={trustpilotTopics}
          selectedPeriod={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
        />
      ) : null}

      {activeTab === 'google' ? (
        <PlaceholderPanel
          title="Integrazione GMB in arrivo"
          description="Questa sezione ospiterà presto le recensioni Google My Business con vista dedicata per sede, così il team potrà confrontare facilmente andamento, volumi e qualità per singola location."
          accentClassName="bg-[linear-gradient(135deg,_#eff6ff_0%,_#ffffff_55%,_#f8fafc_100%)] border-sky-100"
        />
      ) : null}

      {activeTab === 'apple' ? (
        <PlaceholderPanel
          title="Integrazione iOS in arrivo"
          description="Qui arriverà il monitoraggio delle recensioni App Store con gli stessi standard della dashboard attuale, pronto per letture rapide su rating, feedback prodotto e trend delle ultime recensioni."
          accentClassName="bg-[linear-gradient(135deg,_#f5f5f5_0%,_#ffffff_55%,_#fafafa_100%)] border-neutral-200"
        />
      ) : null}

      {activeTab === 'playstore' ? (
        <div className="space-y-6">
          <section className="rounded-[24px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-700">Android Play Store</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Distribuzione stelle</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Vista sintetica delle recensioni Android filtrate per il periodo selezionato.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { value: 'month', label: 'Ultimo mese' },
                  { value: '3months', label: 'Ultimi 3 mesi' },
                  { value: 'all', label: 'Tutto' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedPeriod(option.value)}
                    className={[
                      'rounded-full border px-4 py-2 text-sm font-semibold transition',
                      selectedPeriod === option.value
                        ? 'border-lime-700 bg-lime-700 text-white'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-lime-200 hover:bg-lime-50 hover:text-lime-800',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[18px] border border-lime-100 bg-[linear-gradient(135deg,_#f7fee7_0%,_#ffffff_100%)] p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-700">Panoramica</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{playstoreStats?.total_reviews || 0}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Recensioni Android incluse nel periodo selezionato.
                </p>
              </div>

              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-700">Stelle</p>
                <h3 className="mt-2 text-lg font-semibold text-ink">Distribuzione da 1 a 5</h3>
                <div className="mt-5">
                  <HorizontalBarChart
                    items={playstoreStars}
                    emptyLabel="Nessuna recensione Android disponibile nel periodo selezionato."
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-700">Recensioni recenti</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Ultime recensioni Android</h3>
              </div>
              <p className="text-sm text-neutral-500">
                {playstoreReviews?.totale || 0} recensioni Android totali
              </p>
            </div>

            {playstoreReviews?.recensioni?.length ? (
              playstoreReviews.recensioni.map((review) => (
                <ReviewRow key={review.id} review={review} compact />
              ))
            ) : (
              <div className="rounded-[16px] border border-dashed border-neutral-200 bg-white px-5 py-12 text-center shadow-sm">
                <p className="text-base font-semibold text-ink">Nessuna recensione Android trovata</p>
                <p className="mt-2 text-sm text-neutral-500">
                  I dati appariranno qui appena il canale Play Store inizierà a popolarsi.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
