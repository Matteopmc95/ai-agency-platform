import { useEffect, useState } from 'react';
import AnalyticsReport from '../components/AnalyticsReport';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { fetchStats, fetchTopicsBySegment, getErrorMessage } from '../lib/api';

export default function AnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [stats, setStats] = useState(null);
  const [topicsBySegment, setTopicsBySegment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setLoading(true);
        setError('');

        const [statsData, topicsData] = await Promise.all([
          fetchStats({ period: selectedPeriod }),
          fetchTopicsBySegment({ period: selectedPeriod }),
        ]);

        setStats(statsData);
        setTopicsBySegment(topicsData);
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

  return (
    <div className="space-y-6">
      <section className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-600">Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
          Andamento recensioni
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Una vista chiara su segmenti, topic e comportamento clienti nel periodo selezionato.
        </p>
      </section>

      <AnalyticsReport
        stats={stats}
        topicsBySegment={topicsBySegment}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />
    </div>
  );
}
