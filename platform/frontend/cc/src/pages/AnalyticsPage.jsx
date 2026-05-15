import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchReviews, getErrorMessage } from '../lib/api';
import FilterBar from '../components/analytics/FilterBar';
import Sidebar from '../components/analytics/Sidebar';
import Section1Overview from '../components/analytics/Section1Overview';
import Section2Segmenti from '../components/analytics/Section2Segmenti';
import Section3Topics from '../components/analytics/Section3Topics';
import Section4Journey from '../components/analytics/Section4Journey';
import Section5Tempistiche from '../components/analytics/Section5Tempistiche';
import Section6AI from '../components/analytics/Section6AI';
import SkeletonLoader from '../components/analytics/shared/SkeletonLoader';
import EmptyState from '../components/analytics/shared/EmptyState';
import { exportToPdf } from '../lib/exportPdf';

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
  const [exporting, setExporting] = useState(false);
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
      if (topics.length   && !topics.some(t => (r.topic || []).includes(t)))  return false;
      if (status === 'matched' && r.enrichment_status !== 'matched') return false;
      if (status === 'pending' && r.enrichment_status !== 'pending_sync') return false;
      if (customer === 'new'        && !r.prima_prenotazione) return false;
      if (customer === 'returning'  && r.prima_prenotazione)  return false;
      if (customer === 'cross2'     && !r.cross)              return false;
      if (customer === 'cross3plus' && !r.cross)              return false;
      return true;
    });
  }, [allReviews, filters]);

  async function handleExportPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportToPdf({ reviews: filteredReviews, filters, sectionRefs });
    } finally {
      setExporting(false);
    }
  }

  function scrollTo(id) {
    if (id === 'pdf') { handleExportPdf(); return; }
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
      <Sidebar activeSection={activeSection} onNavigate={scrollTo} exporting={exporting} />

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

              {/* Sezione 1 — Overview */}
              <Section1Overview
                ref={el => { sectionRefs.current.s1 = el; }}
                reviews={filteredReviews}
                allReviews={allReviews}
                filters={filters}
              />

              {/* Sezione 2 — Segmenti & Location */}
              <Section2Segmenti
                ref={el => { sectionRefs.current.s2 = el; }}
                reviews={filteredReviews}
                filters={filters}
                onFilter={updateFilters}
              />

              {/* Sezione 3 — Topic Analysis */}
              <Section3Topics
                ref={el => { sectionRefs.current.s3 = el; }}
                reviews={filteredReviews}
              />

              {/* Sezione 4 — Customer Journey */}
              <Section4Journey
                ref={el => { sectionRefs.current.s4 = el; }}
                reviews={filteredReviews}
              />

              {/* Sezione 5 — Tempistiche */}
              <Section5Tempistiche
                ref={el => { sectionRefs.current.s5 = el; }}
                reviews={filteredReviews}
              />

              {/* Sezione 6 — AI & Risposte */}
              <Section6AI
                ref={el => { sectionRefs.current.s6 = el; }}
                reviews={filteredReviews}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
