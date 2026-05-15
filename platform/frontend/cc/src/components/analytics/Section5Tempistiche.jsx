import { forwardRef, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import SectionWrapper from './shared/SectionWrapper';
import EmptyState from './shared/EmptyState';
import { GRID_COLOR, AXIS_COLOR, RATING_COLOR, VOLUME_COLOR } from './analytics-constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const DOW_ORDER  = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const TIMING_BINS = [
  { label: '0-3 gg',    min: 0,  max: 3 },
  { label: '4-7 gg',    min: 4,  max: 7 },
  { label: '1-2 sett',  min: 8,  max: 14 },
  { label: '2-4 sett',  min: 15, max: 30 },
  { label: '1-3 mesi',  min: 31, max: 90 },
  { label: '3+ mesi',   min: 91, max: Infinity },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function interpolateOrange(t) {
  // t=0 → white, t=1 → brand orange #FF8300
  const r = Math.round(255 + (255 - 255) * t);
  const g = Math.round(255 + (131 - 255) * t);
  const b = Math.round(255 + (0   - 255) * t);
  return `rgb(${r},${g},${b})`;
}

function SimpleTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <p className="text-xs text-neutral-500">
        {payload[0]?.name}: <span className="font-semibold text-ink">{payload[0]?.value}{unit}</span>
      </p>
    </div>
  );
}

// ── Section5Tempistiche ───────────────────────────────────────────────────────

const Section5Tempistiche = forwardRef(function Section5Tempistiche({ reviews }, ref) {

  // Anno selezionato per la heatmap (indipendente dal filtro globale)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const availableYears = useMemo(() => {
    const years = new Set();
    reviews.forEach(r => {
      if (!r.data) return;
      const y = new Date(r.data).getFullYear();
      if (!isNaN(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a); // desc: 2026, 2025, ...
  }, [reviews]);

  // Se l'anno selezionato non è più disponibile (cambio filtro globale) → reset al più recente
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // Reviews filtrate per anno: usate solo dalla heatmap
  const heatmapReviews = useMemo(
    () => reviews.filter(r => r.data && new Date(r.data).getFullYear() === selectedYear),
    [reviews, selectedYear]
  );

  // Day of week distribution
  const dowData = useMemo(() => {
    const counts = Array(7).fill(0);
    reviews.forEach(r => {
      if (!r.data) return;
      const d = new Date(r.data.slice(0, 10) + 'T12:00:00Z');
      counts[d.getUTCDay()]++;
    });
    return DOW_ORDER.map(d => ({ label: DOW_LABELS[d], count: counts[d] }));
  }, [reviews]);

  // Hour of day distribution
  const hourData = useMemo(() => {
    const counts = Array(24).fill(0);
    let hasTime = 0;
    reviews.forEach(r => {
      if (!r.data) return;
      // r.data may or may not include time component
      const dt = new Date(r.data);
      if (isNaN(dt.getTime())) return;
      const h = dt.getUTCHours();
      counts[h]++;
      hasTime++;
    });
    if (hasTime === 0) return [];
    return Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, count: counts[h] }));
  }, [reviews]);

  // Timing histogram: days between booking_date and review date
  const timingData = useMemo(() => {
    const diffs = reviews
      .filter(r => r.data && r.booking_date)
      .map(r => {
        const rev  = new Date(r.data.slice(0, 10)).getTime();
        const book = new Date(r.booking_date.slice(0, 10)).getTime();
        return Math.max(0, Math.round((rev - book) / 86_400_000));
      })
      .filter(d => !isNaN(d) && d >= 0);

    if (!diffs.length) return [];

    return TIMING_BINS.map(bin => ({
      label: bin.label,
      count: diffs.filter(d => d >= bin.min && d <= bin.max).length,
    }));
  }, [reviews]);

  // Seasonality heatmap: month (1-12) × day of week (0-6) — solo anno selezionato
  const heatmap = useMemo(() => {
    const matrix = Array.from({ length: 12 }, () => Array(7).fill(0));
    heatmapReviews.forEach(r => {
      if (!r.data) return;
      const d = new Date(r.data.slice(0, 10) + 'T12:00:00Z');
      const m   = d.getUTCMonth();
      const dow = d.getUTCDay();
      matrix[m][dow]++;
    });

    let maxVal = 1;
    matrix.forEach(row => row.forEach(v => { if (v > maxVal) maxVal = v; }));
    return { matrix, maxVal };
  }, [heatmapReviews]);

  const hasHourData  = hourData.some(d => d.count > 0);
  const hasTimingData = timingData.some(d => d.count > 0);

  if (!reviews.length) {
    return (
      <SectionWrapper ref={ref} id="s5" label="Tempistiche" title="Tempistiche">
        <EmptyState message="Nessuna recensione nel periodo selezionato." />
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper
      ref={ref}
      id="s5"
      label="Tempistiche"
      title="Tempistiche"
      subtitle="Distribuzione temporale delle recensioni e tempi di risposta"
    >
      <div className="space-y-8">

        {/* ── Row 1: DoW + Hour ───────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Day of week */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Recensioni per giorno della settimana</p>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={dowData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip content={<SimpleTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar
                  dataKey="count"
                  fill={VOLUME_COLOR}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  name="Recensioni"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Hour of day */}
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Recensioni per ora del giorno</p>
            {hasHourData ? (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={hourData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: AXIS_COLOR }}
                    axisLine={false}
                    tickLine={false}
                    interval={3}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: AXIS_COLOR }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip content={<SimpleTooltip />} cursor={{ stroke: '#e2e8f0' }} />
                  <Line
                    dataKey="count"
                    stroke={RATING_COLOR}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    name="Recensioni"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-neutral-400">Dati orari non disponibili per le recensioni nel periodo.</p>
            )}
          </div>
        </div>

        {/* ── Timing histogram ────────────────────────────────────── */}
        {hasTimingData && (
          <div>
            <p className="mb-4 text-sm font-semibold text-neutral-700">Tempo dalla prenotazione alla recensione</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={timingData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip content={<SimpleTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar
                  dataKey="count"
                  fill="#0ea5e9"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={56}
                  name="Recensioni"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Seasonality heatmap: Month × DoW ────────────────────── */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-700">Stagionalita (mese × giorno settimana)</p>
            {availableYears.length > 1 && (
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-300"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="py-1.5 pr-4 text-left text-xs font-semibold text-neutral-400">Mese</th>
                  {DOW_ORDER.map(d => (
                    <th key={d} className="min-w-[60px] px-2 py-1.5 text-center text-xs font-semibold text-neutral-500">
                      {DOW_LABELS[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTH_LABELS.map((m, mi) => (
                  <tr key={m}>
                    <td className="py-1.5 pr-4 text-left font-semibold text-neutral-600">{m}</td>
                    {DOW_ORDER.map(d => {
                      const val = heatmap.matrix[mi][d];
                      const t   = heatmap.maxVal > 0 ? val / heatmap.maxVal : 0;
                      return (
                        <td
                          key={d}
                          className="min-h-[40px] min-w-[60px] px-3 py-2 text-center font-semibold"
                          style={{
                            backgroundColor: interpolateOrange(Math.min(t * 1.3, 1)),
                            color: t > 0.6 ? '#fff' : '#374151',
                            borderRadius: 6,
                          }}
                        >
                          {val > 0 ? val : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </SectionWrapper>
  );
});

export default Section5Tempistiche;
