import { useEffect, useMemo, useState } from 'react';
import { DonutChart, HorizontalBarChart, MiniTrend } from '../components/Charts';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import ReviewFilters from '../components/ReviewFilters';
import ReviewRow from '../components/ReviewRow';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import { fetchReviews, fetchStats, getErrorMessage } from '../lib/api';
import { formatPercent, getStatusCount, getTotalReviews, statusLabel } from '../lib/utils';

const PAGE_SIZE = 10;
const defaultFilters = {
  status: '',
  minStars: '1',
  maxStars: '5',
};

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [reviewsData, setReviewsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [reviewsError, setReviewsError] = useState('');
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);

  async function loadStats() {
    try {
      setStatsLoading(true);
      setStatsError('');
      const data = await fetchStats();
      setStats(data);
    } catch (error) {
      setStatsError(getErrorMessage(error, 'Impossibile caricare le statistiche.'));
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadReviews(currentFilters = filters, currentPage = page) {
    try {
      setReviewsLoading(true);
      setReviewsError('');
      const data = await fetchReviews({
        stato: currentFilters.status || undefined,
        stelle_min: currentFilters.minStars,
        stelle_max: currentFilters.maxStars,
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      });
      setReviewsData(data);
    } catch (error) {
      setReviewsError(getErrorMessage(error, 'Impossibile caricare le recensioni.'));
    } finally {
      setReviewsLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadReviews(filters, page);
  }, [filters, page]);

  const totalPages = useMemo(() => {
    if (!reviewsData?.totale) return 1;
    return Math.max(1, Math.ceil(reviewsData.totale / PAGE_SIZE));
  }, [reviewsData]);

  const totalReviews = getTotalReviews(stats);
  const statusChartData = (stats?.per_stato || []).map((item, index) => ({
    label: statusLabel(item.stato),
    value: item.n,
    color: ['#FF8300', '#525252', '#16A34A', '#DC2626'][index % 4],
  }));
  const starsChartData = (stats?.per_stelle || [])
    .slice()
    .sort((a, b) => a.stelle - b.stelle)
    .map((item) => ({
      label: `${item.stelle}★`,
      value: item.n,
      color: item.stelle >= 4 ? '#FF8300' : '#A3A3A3',
    }));
  const topicChartData = (stats?.top_topic || []).slice(0, 6).map((item, index) => ({
    label: item.topic,
    value: item.count,
    color: ['#FF8300', '#CC6500', '#171717', '#737373', '#16A34A', '#FEAC51'][index % 6],
  }));

  function handleFilterChange(key, value) {
    setPage(1);
    setFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === 'minStars' && Number(value) > Number(current.maxStars)) {
        next.maxStars = value;
      }

      if (key === 'maxStars' && Number(value) < Number(current.minStars)) {
        next.minStars = value;
      }

      return next;
    });
  }

  function handleResetFilters() {
    setPage(1);
    setFilters(defaultFilters);
  }

  return (
    <div className="space-y-6">
      {statsLoading ? <LoadingState label="Recupero statistiche aggregate..." /> : null}
      {!statsLoading && statsError ? <ErrorState message={statsError} onRetry={loadStats} /> : null}
      {!statsLoading && !statsError && stats ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[24px] border border-brand-100 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_55%,_#fffaf5_100%)] p-6 text-ink shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
                Overview
              </p>
              <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-2xl">
                  <h3 className="text-[32px] font-semibold leading-tight">
                    Una vista operativa completa per leggere, filtrare e pubblicare piu velocemente.
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">
                    La dashboard mette in evidenza volumi, priorita e segnali utili per le recensioni che richiedono un intervento del team Customer Care.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
                  <div className="rounded-[20px] border border-brand-100 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Totale</p>
                    <p className="mt-2 text-3xl font-semibold">{getTotalReviews(stats)}</p>
                  </div>
                  <div className="rounded-[20px] border border-brand-100 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">In attesa</p>
                    <p className="mt-2 text-3xl font-semibold">{getStatusCount(stats, 'pending')}</p>
                  </div>
                  <div className="rounded-[20px] border border-brand-100 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Pubblicate</p>
                    <p className="mt-2 text-3xl font-semibold">{getStatusCount(stats, 'published')}</p>
                  </div>
                </div>
              </div>
            </div>

            <section className="rounded-[24px] border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
                Top topic
              </p>
              <div className="mt-4 space-y-3">
                {stats.top_topic?.length ? (
                  stats.top_topic.slice(0, 5).map((item, index) => (
                    <div
                      key={item.topic}
                      className="flex items-center justify-between rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-ink">{item.topic}</p>
                          <p className="text-xs text-neutral-500">Tema piu ricorrente</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-brand-700">{item.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-neutral-500">Nessun topic disponibile.</p>
                )}
              </div>
            </section>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Totale recensioni"
              value={getTotalReviews(stats)}
              accent="linear-gradient(135deg, #FF8300, #CC6500)"
              helper="Volume complessivo gestito dalla piattaforma"
            />
            <StatCard
              label="In attesa"
              value={getStatusCount(stats, 'pending')}
              accent="linear-gradient(135deg, #FF9828, #FF8300)"
              helper="Review ancora da validare o pubblicare"
            />
            <StatCard
              label="Pubblicate"
              value={getStatusCount(stats, 'published')}
              accent="linear-gradient(135deg, #16A34A, #166534)"
              helper="Risposte inviate con successo a Trustpilot"
            />
            <StatCard
              label="Referral / Cross"
              value={`${stats.flag_referral} / ${stats.flag_cross}`}
              accent="linear-gradient(135deg, #171717, #525252)"
              helper="Segnali utili per prioritizzazione commerciale"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionCard
              eyebrow="Analytics"
              title="Distribuzione recensioni"
              description="Una vista veloce per capire il peso relativo dei diversi stati operativi."
              contentClassName="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]"
            >
              <DonutChart
                items={statusChartData}
                total={totalReviews}
                centerLabel="Recensioni"
                centerValue={totalReviews}
              />

              <div className="space-y-4">
                {statusChartData.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm font-semibold text-ink">{item.label}</span>
                      </div>
                      <span className="text-sm font-semibold text-neutral-500">
                        {item.value} · {formatPercent(item.value, totalReviews)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Insight"
              title="Lettura qualitativa"
              description="Grafici compatti per stelle e topic principali, utili a orientare il lavoro giornaliero."
              contentClassName="grid gap-6 lg:grid-cols-2"
            >
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-ink">Distribuzione per stelle</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Valuta se il flusso attuale è trainato da 4 o 5 stelle.
                  </p>
                </div>
                <MiniTrend items={starsChartData} />
                <HorizontalBarChart items={starsChartData} />
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-ink">Topic più ricorrenti</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Evidenzia i temi che ricorrono nelle recensioni più recenti.
                  </p>
                </div>
                <HorizontalBarChart items={topicChartData} emptyLabel="Nessun topic disponibile." />
              </div>
            </SectionCard>
          </section>
        </>
      ) : null}

      <ReviewFilters
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
      />

      {reviewsLoading ? <LoadingState label="Caricamento recensioni..." /> : null}
      {!reviewsLoading && reviewsError ? (
        <ErrorState message={reviewsError} onRetry={() => loadReviews(filters, page)} />
      ) : null}
      {!reviewsLoading && !reviewsError && reviewsData ? (
        <SectionCard
          eyebrow="Coda operativa"
          title="Recensioni da gestire"
          description="Una lista leggibile e orientata all’azione, con priorità e metadati visibili subito."
          actions={
            <>
              <span className="text-sm text-neutral-500">
                {reviewsData.totale} recensioni trovate
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Precedente
              </button>
              <span className="text-sm font-semibold text-neutral-700">
                Pagina {page} di {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Successiva
              </button>
            </>
          }
          contentClassName="space-y-4"
        >
          {reviewsData.recensioni?.length ? (
            reviewsData.recensioni.map((review) => <ReviewRow key={review.id} review={review} />)
          ) : (
            <div className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
              Nessuna recensione trovata con i filtri selezionati.
            </div>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
