import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchReviews, getErrorMessage } from '../lib/api';
import FilterBar from '../components/analytics/FilterBar';
import Sidebar from '../components/analytics/Sidebar';
import SkeletonLoader from '../components/analytics/shared/SkeletonLoader';
import EmptyState from '../components/analytics/shared/EmptyState';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const SECTIONS = [
  { id: 's1', label: 'Overview' },
  { id: 's2', label: 'Segmenti & Location' },
  { id: 's3', label: 'Topic Analysis' },
  { id: 's4', label: 'Customer Journey' },
  { id: 's5', label: 'Tempistiche' },
  { id: 's6', label: 'AI & Risposte' },
];

export default function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allReviews, setAllReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('s1');
  const sectionRefs = useRef({});
  const mainRef = useRef(null);

  // Derive all filter state from URL — single source of truth
  const filters = useMemo(() => ({
    from:     searchParams.get('from')              || daysAgoIso(30),
    to:       searchParams.get('to')               || todayIso(),
    segmenti: searchParams.getAll('seg'),
    sources:  searchParams.getAll('src'),
    stelle:   searchParams.getAll('stelle').map(Number),
    topics:   searchParams.getAll('topic'),
    status:   searchParams.get('status')           || '',
    customer: searchParams.get('customer')         || '',
  }), [searchParams]);

  function updateFilters(updates) {
    const next = new URLSearchParams(searchParams);
    const KEY_MAP = { segmenti: 'seg', sources: 'src' };
    Object.entries(updates).forEach(([key, value]) => {
      const urlKey = KEY_MAP[key] || key;
      next.delete(urlKey);
      if (Array.isArray(value)) {
        value.forEach(v => next.append(urlKey, String(v)));
      } else if (value !== '' && value !== null && value !== undefined) {
        next.set(urlKey, String(value));
      }
    });
    setSearchParams(next, { replace: true });
  }

  function resetFilters() {
    setSearchParams({}, { replace: true });
  }

  // Fetch all reviews once on mount
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchReviews({ limit: 9999 });
      setAllReviews(data?.recensioni || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Impossibile caricare le recensioni.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Intersection observer to track active section
  useEffect(() => {
    if (loading) return;
    const root = mainRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      entries => {
        const hit = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActiveSection(hit.target.id);
      },
      { root, threshold: 0.15, rootMargin: '-60px 0px -55% 0px' }
    );

    Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [loading]);

  // All client-side filtering — O(n) single pass
  const filteredReviews = useMemo(() => {
    const { from, to, segmenti, sources, stelle, topics, status, customer } = filters;
    const toEnd = to ? to + 'T23:59:59' : null;

    return allReviews.filter(r => {
      if (from && (r.data || '') < from) return false;
      if (toEnd && (r.data || '') > toEnd) return false;
      if (segmenti.length && !segmenti.includes(r.segmento)) return false;
      if (sources.length  && !sources.includes(r.source))   return false;
      if (stelle.length   && !stelle.includes(Number(r.stelle))) return false;
      if (topics.length   && !topics.some(t => (r.topics || []).includes(t))) return false;
      if (status === 'matched' && r.enrichment_status !== 'matched') return false;
      if (status === 'pending' && r.enrichment_status !== 'pending_sync') return false;
      if (customer === 'new'        && (r.n_prenotazioni_precedenti || 0) !== 0) return false;
      if (customer === 'returning'  && (r.n_prenotazioni_precedenti || 0) < 1)   return false;
      if (customer === 'cross2'     && !r.cross_ever_completed_only)             return false;
      if (customer === 'cross3plus' && (r.segmenti_precedenti || []).length < 2) return false;
      return true;
    });
  }, [allReviews, filters]);

  function scrollTo(id) {
    if (id === 'pdf') return; // PDF handler will be wired in FASE 7
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Break out of Layout padding (px-4 py-4 lg:px-8 lg:py-6)
  // header is h-14 = 56px
  return (
    <div
      className="-mx-4 -my-4 lg:-mx-8 lg:-my-6 flex overflow-hidden"
      style={{ height: 'calc(100vh - 56px)' }}
    >
      <Sidebar activeSection={activeSection} onNavigate={scrollTo} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <FilterBar
          filters={filters}
          onUpdate={updateFilters}
          onReset={resetFilters}
          total={allReviews.length}
          filtered={filteredReviews.length}
        />

        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto bg-[#f8f7f4] px-6 py-6"
        >
          {loading ? (
            <SkeletonLoader />
          ) : error ? (
            <EmptyState message={error} onRetry={load} isError />
          ) : (
            <div className="space-y-6">
              {filteredReviews.length === 0 && (
                <EmptyState message="Nessuna recensione trovata con i filtri applicati." />
              )}

              {SECTIONS.map(({ id, label }, i) => (
                <section
                  key={id}
                  id={id}
                  ref={el => { sectionRefs.current[id] = el; }}
                  className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                    {label}
                  </p>
                  <p className="mt-1 text-sm text-neutral-400">
                    Fase {i + 1} — in costruzione
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-ink">
                    {id === 's1'
                      ? `${filteredReviews.length.toLocaleString('it-IT')} recensioni caricate`
                      : null}
                  </p>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
