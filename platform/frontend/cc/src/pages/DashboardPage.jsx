import { useEffect, useState } from 'react';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import ReviewRow from '../components/ReviewRow';
import Stars from '../components/Stars';
import { useUserProfile } from '../lib/auth';
import { fetchReviews, fetchStats, getErrorMessage } from '../lib/api';
import { formatLongDate, getAverageStars, getStatusCount } from '../lib/utils';

function MetricCard({ label, value, helper, accent, children }) {
  return (
    <div className="rounded-[16px] border border-neutral-200 bg-white p-5 shadow-sm">
      <div
        className="mb-4 h-1.5 w-12 rounded-full"
        style={{ background: accent }}
      />
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">{value}</p>
      {children ? <div className="mt-3">{children}</div> : null}
      {helper ? <p className="mt-2 text-sm leading-6 text-neutral-500">{helper}</p> : null}
    </div>
  );
}

export default function DashboardPage() {
  const { name } = useUserProfile();
  const [stats, setStats] = useState(null);
  const [monthStats, setMonthStats] = useState(null);
  const [latestReviews, setLatestReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError('');

        const [statsData, monthStatsData, reviewsData] = await Promise.all([
          fetchStats({ period: 'all' }),
          fetchStats({ period: 'current_month' }),
          fetchReviews({
            stelle_min: 1,
            stelle_max: 5,
            limit: 5,
            offset: 0,
          }),
        ]);

        setStats(statsData);
        setMonthStats(monthStatsData);
        setLatestReviews(reviewsData.recensioni || []);
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Impossibile caricare i dati, riprova.'));
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return <LoadingState label="Sto preparando la dashboard operativa..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  const averageStars = getAverageStars(stats);

  return (
    <div className="space-y-6">
      <section className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-600">Dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
          Buongiorno {name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          {formatLongDate()}.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          label="Recensioni oggi"
          value={stats?.reviews_today || 0}
          helper="Nuove recensioni ricevute oggi da tutte le fonti"
          accent="linear-gradient(135deg, #FF6600, #FF8A3D)"
        />
        <MetricCard
          label="In attesa di risposta"
          value={getStatusCount(stats, 'pending')}
          helper="Recensioni ancora da gestire su tutte le fonti"
          accent="linear-gradient(135deg, #FFB020, #FFD166)"
        />
        <MetricCard
          label="Pubblicate questo mese"
          value={getStatusCount(monthStats, 'published')}
          helper="Risposte inviate nel mese corrente da tutte le fonti"
          accent="linear-gradient(135deg, #22C55E, #86EFAC)"
        />
        <MetricCard
          label="Media stelle"
          value={averageStars ? averageStars.toFixed(1) : '0.0'}
          helper="Valutazione media complessiva su tutte le fonti"
          accent="linear-gradient(135deg, #FF6600, #FFB347)"
        >
          <Stars value={Math.round(averageStars)} />
        </MetricCard>
      </section>

      <section className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-600">
              Ultime recensioni
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">
              Le 5 più recenti
            </h2>
          </div>
          <p className="text-sm text-neutral-500">
            Una vista rapida delle recensioni arrivate più di recente.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {latestReviews.length ? (
            latestReviews.map((review) => <ReviewRow key={review.id} review={review} compact />)
          ) : (
            <div className="rounded-[16px] border border-dashed border-neutral-200 bg-neutral-50 px-5 py-10 text-center">
              <p className="text-base font-semibold text-ink">Nessuna recensione disponibile</p>
              <p className="mt-2 text-sm text-neutral-500">
                Quando arriveranno nuove recensioni le troverai qui.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
