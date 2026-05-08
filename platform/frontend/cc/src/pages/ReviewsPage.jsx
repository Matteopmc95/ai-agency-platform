import { useEffect, useMemo, useState } from 'react';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import ReviewRow from '../components/ReviewRow';
import { fetchReviews, getErrorMessage } from '../lib/api';

const PAGE_SIZE = 50;
const defaultFilters = {
  status: '',
  minStars: '1',
  maxStars: '5',
  source: '',
  sort: 'desc',
};

export default function ReviewsPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [openFilters, setOpenFilters] = useState(false);
  const [reviewsData, setReviewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    async function loadReviews() {
      try {
        setLoading(true);
        setError('');

        const data = await fetchReviews({
          stato: filters.status || undefined,
          stelle_min: filters.minStars,
          stelle_max: filters.maxStars,
          source: filters.source || undefined,
          sort: filters.sort,
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

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const totalPages = useMemo(() => {
    if (!reviewsData?.totale) return 1;
    return Math.max(1, Math.ceil(reviewsData.totale / PAGE_SIZE));
  }, [reviewsData]);

  const visiblePages = useMemo(() => {
    const maxVisible = 5;
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, page - half);
    const end = Math.min(totalPages, start + maxVisible - 1);

    start = Math.max(1, end - maxVisible + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [page, totalPages]);

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

  function goToPage(nextPage) {
    const normalizedPage = Math.min(totalPages, Math.max(1, Number(nextPage) || 1));
    setPage(normalizedPage);
  }

  function handlePageJump(event) {
    event.preventDefault();
    goToPage(pageInput);
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
            <div className="grid gap-3 md:grid-cols-6">
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

              <label className="space-y-2 text-sm font-medium text-neutral-700">
                <span>Fonte</span>
                <select
                  value={filters.source}
                  onChange={(event) => handleFilterChange('source', event.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-brand-400 focus:bg-white"
                >
                  <option value="">Tutte le fonti</option>
                  <option value="trustpilot">Trustpilot</option>
                  <option value="apple">iOS App Store</option>
                  <option value="playstore">Google Play Store</option>
                  <option value="google">Google My Business</option>
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-neutral-700">
                <span>Ordina per</span>
                <select
                  value={filters.sort}
                  onChange={(event) => handleFilterChange('sort', event.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-brand-400 focus:bg-white"
                >
                  <option value="desc">Più recenti</option>
                  <option value="asc">Più vecchie</option>
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
            <p className="text-sm font-semibold text-neutral-600">Pagina {page} di {totalPages}</p>
          </div>

          {reviewsData?.recensioni?.length ? (
            reviewsData.recensioni.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                onUpdate={(id, updates) =>
                  setReviewsData((current) =>
                    current
                      ? {
                          ...current,
                          recensioni: current.recensioni.map((r) =>
                            r.id === id ? { ...r, ...updates } : r
                          ),
                        }
                      : current
                  )
                }
              />
            ))
          ) : (
            <div className="rounded-[16px] border border-dashed border-neutral-200 bg-white px-5 py-12 text-center shadow-sm">
              <p className="text-base font-semibold text-ink">Nessuna recensione trovata</p>
              <p className="mt-2 text-sm text-neutral-500">
                Prova a cambiare i filtri per visualizzare più risultati.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-[16px] border border-neutral-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(1)}
                disabled={page === 1}
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                « Prima
              </button>
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ‹ Precedente
              </button>

              {visiblePages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => goToPage(pageNumber)}
                  className={`h-10 min-w-10 rounded-full border px-3 text-sm font-semibold transition ${
                    pageNumber === page
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                  }`}
                  aria-current={pageNumber === page ? 'page' : undefined}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages}
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Successiva ›
              </button>
              <button
                type="button"
                onClick={() => goToPage(totalPages)}
                disabled={page === totalPages}
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ultima »
              </button>
            </div>

            <form onSubmit={handlePageJump} className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-neutral-600">Pagina {page} di {totalPages}</span>
              <label className="flex items-center gap-2 text-sm text-neutral-500">
                Vai a pagina
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                  className="h-10 w-20 rounded-full border border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-700 outline-none transition focus:border-brand-400 focus:bg-white"
                />
              </label>
              <button
                type="submit"
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                Vai
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
