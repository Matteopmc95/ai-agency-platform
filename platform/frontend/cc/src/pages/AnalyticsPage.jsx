import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AnalyticsReport from '../components/AnalyticsReport';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import ReviewRow from '../components/ReviewRow';
import { HorizontalBarChart } from '../components/Charts';
import { fetchReviews, fetchStats, fetchTopicsBySegment, getErrorMessage } from '../lib/api';
import { getStarDistribution } from '../lib/utils';

// ── helpers ────────────────────────────────────────────────────────────────

const MONTHS = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
];

const CHANNELS = [
  { value: '',           label: 'Tutti i canali' },
  { value: 'trustpilot', label: 'Trustpilot' },
  { value: 'apple',      label: 'iOS App Store' },
  { value: 'playstore',  label: 'Android Play Store' },
  { value: 'gmb',        label: 'Google My Business' },
];

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function pad2(n) { return String(n).padStart(2, '0'); }

function isoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// ── component ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const now = new Date();
  const analyticsRef = useRef(null);

  // Period mode: 'month' | 'range'
  const [periodMode, setPeriodMode] = useState('month');

  // Month-mode state (default: current month)
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);

  // Range-mode state (default: last 30 days)
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [rangeFrom, setRangeFrom] = useState(isoDate(thirtyDaysAgo.getFullYear(), thirtyDaysAgo.getMonth()+1, thirtyDaysAgo.getDate()));
  const [rangeTo,   setRangeTo]   = useState(isoDate(now.getFullYear(), now.getMonth()+1, now.getDate()));

  // Channel
  const [channel, setChannel] = useState('');

  // Data
  const [stats,  setStats]  = useState(null);
  const [topics, setTopics] = useState(null);
  const [appleReviews, setAppleReviews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Derived date params
  const { fromDate, toDate, periodLabel } = useMemo(() => {
    if (periodMode === 'month') {
      const last = lastDayOfMonth(selYear, selMonth);
      const from = isoDate(selYear, selMonth, 1);
      const to   = isoDate(selYear, selMonth, last);
      return { fromDate: from, toDate: to, periodLabel: `${selYear}-${pad2(selMonth)}` };
    }
    return { fromDate: rangeFrom, toDate: rangeTo, periodLabel: `${rangeFrom}_${rangeTo}` };
  }, [periodMode, selYear, selMonth, rangeFrom, rangeTo]);

  const channelLabel = CHANNELS.find(c => c.value === channel)?.label?.replace(' ', '') || 'Tutti';

  // Years range for dropdown
  const years = [];
  for (let y = 2024; y <= now.getFullYear() + 1; y++) years.push(y);

  // Fetch
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { from_date: fromDate, to_date: toDate, ...(channel ? { source: channel } : {}) };
      const [statsData, topicsData, appleData] = await Promise.all([
        fetchStats(params),
        fetchTopicsBySegment(params),
        channel === '' || channel === 'apple'
          ? fetchReviews({ source: 'apple', limit: 6, offset: 0 })
          : Promise.resolve(null),
      ]);
      setStats(statsData);
      setTopics(topicsData);
      setAppleReviews(appleData);
    } catch (err) {
      setError(getErrorMessage(err, 'Impossibile caricare i dati, riprova.'));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, channel]);

  useEffect(() => { load(); }, [load]);

  // PDF generation
  const handlePdf = async () => {
    if (!analyticsRef.current) return;
    setPdfLoading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(analyticsRef.current, { scale: 2, useCORS: true });
      const pdf  = new jsPDF('landscape', 'mm', 'a4');
      const w    = pdf.internal.pageSize.getWidth();
      const h    = (canvas.height * w) / canvas.width;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
      pdf.save(`Analytics_ParkingMyCar_${periodLabel}_${channelLabel}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  };

  const appleStars = getStarDistribution(channel === 'apple' ? stats : null).map((item) => ({
    ...item,
    color: item.stars >= 4 ? '#0EA5E9' : item.stars === 3 ? '#F59E0B' : '#6366F1',
  }));

  const isAppleOnly = channel === 'apple';

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header + filter bar ─────────────────────────────────────────── */}
      <section className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 print:hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-600">Analytics</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-ink">
              Andamento recensioni
            </h1>
          </div>

          {/* PDF button */}
          <button
            type="button"
            onClick={handlePdf}
            disabled={pdfLoading || loading}
            className="self-start rounded-full px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: '#ff8300' }}
          >
            {pdfLoading ? 'Generazione…' : '⬇ Scarica PDF'}
          </button>
        </div>

        {/* Filter row */}
        <div className="mt-5 flex flex-wrap items-end gap-4">

          {/* Period mode toggle */}
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 p-1">
            {[{ v: 'month', l: 'Mese' }, { v: 'range', l: 'Intervallo' }].map(({ v, l }) => (
              <button
                key={v} type="button"
                onClick={() => setPeriodMode(v)}
                className={[
                  'rounded-full px-3 py-1 text-sm font-semibold transition',
                  periodMode === v ? 'bg-white text-ink shadow-sm' : 'text-neutral-500 hover:text-ink',
                ].join(' ')}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Month pickers */}
          {periodMode === 'month' && (
            <>
              <select
                value={selYear}
                onChange={e => setSelYear(Number(e.target.value))}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-semibold text-neutral-700 outline-none transition focus:border-brand-400"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={selMonth}
                onChange={e => setSelMonth(Number(e.target.value))}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-semibold text-neutral-700 outline-none transition focus:border-brand-400"
              >
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </>
          )}

          {/* Date range pickers */}
          {periodMode === 'range' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-neutral-500">Dal</label>
                <input
                  type="date" value={rangeFrom}
                  max={rangeTo}
                  onChange={e => setRangeFrom(e.target.value)}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-700 outline-none focus:border-brand-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-neutral-500">Al</label>
                <input
                  type="date" value={rangeTo}
                  min={rangeFrom}
                  onChange={e => setRangeTo(e.target.value)}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-700 outline-none focus:border-brand-400"
                />
              </div>
            </>
          )}

          {/* Channel selector */}
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-semibold text-neutral-700 outline-none transition focus:border-brand-400"
          >
            {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </section>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div ref={analyticsRef}>
        {loading ? (
          <LoadingState label="Sto caricando i dati…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : isAppleOnly ? (
          /* Apple-only view: no AI topics */
          <div className="space-y-6">
            <section className="rounded-[24px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">iOS App Store</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Distribuzione stelle</h2>
              <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[18px] border border-sky-100 bg-[linear-gradient(135deg,_#e0f2fe_0%,_#ffffff_100%)] p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Totale</p>
                  <p className="mt-3 text-4xl font-semibold text-ink">{stats?.total_reviews || 0}</p>
                </div>
                <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Stelle</p>
                  <div className="mt-4">
                    <HorizontalBarChart items={appleStars} emptyLabel="Nessuna recensione iOS nel periodo." />
                  </div>
                </div>
              </div>
            </section>
            <div className="rounded-[16px] border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-500">
              ℹ️ L'analisi topic non è disponibile per iOS App Store: Apple non espone API per pubblicare risposte, quindi l'AI non viene applicata.
            </div>
            {appleReviews?.recensioni?.length ? (
              <section className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Ultime recensioni iOS</p>
                {appleReviews.recensioni.map(r => <ReviewRow key={r.id} review={r} compact />)}
              </section>
            ) : null}
          </div>
        ) : (
          /* All other channels: full AnalyticsReport */
          <AnalyticsReport
            stats={stats}
            topicsBySegment={topics}
            selectedPeriod={null}
            onPeriodChange={null}
          />
        )}
      </div>
    </div>
  );
}
