import { useEffect, useMemo, useState } from 'react';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import ReviewRow from '../components/ReviewRow';
import { fetchReviews, getErrorMessage } from '../lib/api';

const PAGE_SIZE = 10;
const defaultFilters = {
  status: '',
  minStars: '1',
  maxStars: '5',
};

export default function ReviewsPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [openFilters, setOpenFilters] = useState(false);
  const [reviewsData, setReviewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadReviews() {
      try {
        setLoading(true);
        setError('');

        const data = await fetchReviews({
          stato: filters.status || undefined,
          stelle_min: filters.minStars,
          stelle_max: filters.maxStars,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });

        setReviewsData(data);
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Impossibile caricare i dati, riprova.'));
      } finally {
        setLoading(false);
      }
    }

    loadReviews();
  }, [filters, page]);

  const totalPages = useMemo(() => {
    if (!reviewsData?.totale) return 1;
    return Math.max(1, Math.ceil(reviewsData.totale / PAGE_SIZE));
  }, [reviewsData]);

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

  function resetFilters() {
    setPage(1);
    setFilters(defaultFilters);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-600">Recensioni</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
                Tutte le recensioni
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setOpenFilters((current) => !current)}
              className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 md:hidden"
            >
              {openFilters ? 'Nascondi filtri' : 'Mostra filtri'}
            </button>
          </div>

          <div className={openFilters ? 'block' : 'hidden md:block'}>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-2 text-sm font-medium text-neutral-700">
                <span>Stato</span>
                <select
                  value={filters.status}
                  onChange={(event) => handleFilterChange('status', event.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-brand-400 focus:bg-white"
                >
                  <option value="">Tutti</option>
                  <option value="pending">In attesa</option>
                  <option value="published">Pubblicata</option>
                  <option value="approved">Approvata</option>
                  <option value="skipped">Scartata</option>
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-neutral-700">
                <span>Stelle minime</span>
                <select
                  value={filters.minStars}
                  onChange={(event) => handleFilterChange('minStars', event.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-brand-400 focus:bg-white"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}+
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-neutral-700">
                <span>Stelle massime</span>
                <select
                  value={filters.maxStars}
                  onChange={(event) => handleFilterChange('maxStars', event.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-brand-400 focus:bg-white"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                >
                  Reset filtri
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loading ? <LoadingState label="Sto caricando le recensioni..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => window.location.reload()} /> : null}

      {!loading && !error ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-neutral-500">
              {reviewsData?.totale || 0} recensioni trovate
            </p>
            <p className="text-sm text-neutral-500">
              Pagina {page} di {totalPages}
            </p>
          </div>

          {reviewsData?.recensioni?.length ? (
            reviewsData.recensioni.map((review) => <ReviewRow key={review.id} review={review} />)
          ) : (
            <div className="rounded-[16px] border border-dashed border-neutral-200 bg-white px-5 py-12 text-center shadow-sm">
              <p className="text-base font-semibold text-ink">Nessuna recensione trovata</p>
              <p className="mt-2 text-sm text-neutral-500">
                Prova a cambiare i filtri per visualizzare più risultati.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-[16px] border border-neutral-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Precedente
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Successiva
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
