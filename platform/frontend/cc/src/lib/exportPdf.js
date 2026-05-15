// Analytics PDF Export — A4 Landscape, pure jsPDF vector drawing
// 8 pages: Cover, Executive Summary, Segmenti, Topics, Journey, Tempistiche, AI, Conclusioni

const PW = 297, PH = 210, M = 15;
const CW = PW - M * 2;
const COL2_GAP = 6;
const COL_W = (CW - COL2_GAP) / 2;
const HEADER_H = 16;
const FOOTER_H = 12;
const CONTENT_Y = M + HEADER_H;
const CONTENT_H = PH - CONTENT_Y - FOOTER_H;

const ORANGE = '#F97316', BLUE = '#0EA5E9', DARK = '#1F2937';
const GRAY = '#6B7280', LGRAY = '#E5E7EB', WHITE = '#FFFFFF';
const VIOLET = '#7C3AED', TEAL = '#0D9488', GREEN = '#10B981', RED = '#EF4444';

const SEG_ORDER  = ['airport', 'port', 'city', 'station'];
const SEG_LABELS = { airport: 'Airport', port: 'Port', city: 'City', station: 'Station' };
const SEG_COLORS = { airport: BLUE, port: TEAL, city: GRAY, station: ORANGE };

const TOPIC_LABELS = {
  'facilità': 'Facilita', 'soddisfazione generale': 'Soddisfazione gen.',
  'velocità': 'Velocita', 'posizione': 'Posizione', 'parcheggio': 'Parcheggio',
  'convenienza': 'Convenienza', 'generico': 'Generico', 'customer care': 'Customer Care',
  'app': 'App', 'servizi': 'Servizi', 'cancellazione': 'Cancellazione',
  'rimborso': 'Rimborso', 'sicurezza': 'Sicurezza', 'pagamento in parcheggio': 'Pagamento',
};
const TOPIC_COLORS = {
  'facilità': '#FF8300', 'soddisfazione generale': '#10B981', 'velocità': '#CC6500',
  'posizione': '#0F766E', 'parcheggio': '#2563EB', 'convenienza': '#7C3AED',
  'generico': '#6B7280', 'customer care': '#DC2626', 'app': '#DB2777',
  'servizi': '#0891B2', 'cancellazione': '#F97316', 'rimborso': '#14B8A6',
  'sicurezza': '#16A34A', 'pagamento in parcheggio': '#A16207',
};
const DOW_ORDER  = [1, 2, 3, 4, 5, 6, 0];
const DOW_S      = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTH_S    = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// ── Primitives ────────────────────────────────────────────────────────────────

function hexRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}
function fc(doc, hex) { const { r, g, b } = hexRgb(hex); doc.setFillColor(r, g, b); }
function tc(doc, hex) { const { r, g, b } = hexRgb(hex); doc.setTextColor(r, g, b); }
function dc(doc, hex) { const { r, g, b } = hexRgb(hex); doc.setDrawColor(r, g, b); }

function box(doc, x, y, w, h, fill, stroke = null, r = 2) {
  if (fill) fc(doc, fill);
  if (stroke) { dc(doc, stroke); doc.setLineWidth(0.3); }
  const mode = fill && stroke ? 'FD' : fill ? 'F' : 'S';
  doc.roundedRect(x, y, w, h, r, r, mode);
}

function hline(doc, x1, x2, y, color = LGRAY, lw = 0.3) {
  dc(doc, color); doc.setLineWidth(lw); doc.line(x1, y, x2, y);
}

function pieSlice(doc, cx, cy, radius, startDeg, endDeg, color) {
  if (Math.abs(endDeg - startDeg) < 0.5) return;
  const steps = Math.max(12, Math.ceil(Math.abs(endDeg - startDeg) / 3));
  const toRad = d => (d - 90) * Math.PI / 180;
  const pts = [[cx, cy]];
  for (let i = 0; i <= steps; i++) {
    const a = toRad(startDeg + (endDeg - startDeg) * (i / steps));
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  fc(doc, color); dc(doc, WHITE); doc.setLineWidth(0.4);
  const lines = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.lines(lines, pts[0][0], pts[0][1], [1, 1], 'FD', true);
}

function donut(doc, cx, cy, outerR, innerR, segments) {
  const total = segments.reduce((s, g) => s + g.value, 0);
  if (!total) return;
  let deg = 0;
  for (const seg of segments) {
    const sweep = (seg.value / total) * 360;
    pieSlice(doc, cx, cy, outerR, deg, deg + sweep, seg.color);
    deg += sweep;
  }
  fc(doc, WHITE); doc.circle(cx, cy, innerR, 'F');
}

function hbar(doc, x, y, maxW, h, value, maxVal, color) {
  const bw = maxVal > 0 ? Math.max(0, (value / maxVal) * maxW) : 0;
  fc(doc, '#F3F4F6'); doc.rect(x, y, maxW, h, 'F');
  if (bw > 0) { fc(doc, color); doc.rect(x, y, bw, h, 'F'); }
}

function vbar(doc, x, baseY, w, maxH, value, maxVal, color) {
  const bh = maxVal > 0 ? Math.max(0, (value / maxVal) * maxH) : 0;
  fc(doc, '#F3F4F6'); doc.rect(x, baseY - maxH, w, maxH, 'F');
  if (bh > 0) { fc(doc, color); doc.rect(x, baseY - bh, w, bh, 'F'); }
}

function heatCell(doc, x, y, w, h, value, maxVal, baseHex) {
  const t = maxVal > 0 ? Math.min(value / maxVal, 1) : 0;
  if (t === 0) { fc(doc, '#F3F4F6'); }
  else {
    const { r, g, b } = hexRgb(baseHex);
    doc.setFillColor(
      Math.round(255 + (r - 255) * t),
      Math.round(255 + (g - 255) * t),
      Math.round(255 + (b - 255) * t),
    );
  }
  doc.rect(x, y, w, h, 'F');
  dc(doc, WHITE); doc.setLineWidth(0.2); doc.rect(x, y, w, h, 'S');
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtD(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDLong(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtNow() {
  return new Date().toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtRate(num, den) {
  if (!den || num === 0) return '0%';
  const r = num / den;
  return r < 0.01 ? '<1%' : `${Math.round(r * 100)}%`;
}
function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

// ── Page chrome ────────────────────────────────────────────────────────────────

function drawHeader(doc, title, fromStr, toStr, logoUrl) {
  fc(doc, ORANGE); doc.rect(0, 0, PW, 2.5, 'F');
  if (logoUrl) doc.addImage(logoUrl, 'PNG', M, 4, 28, 3.6);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); tc(doc, DARK);
  doc.text(title, M + 31, 7.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(doc, GRAY);
  doc.text(`${fromStr} → ${toStr}`, PW - M, 7.5, { align: 'right' });
  hline(doc, M, PW - M, 12.5);
}

function drawFooter(doc, n, total) {
  hline(doc, M, PW - M, PH - 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); tc(doc, GRAY);
  doc.text('ParkingMyCar · Documento riservato', M, PH - 7);
  doc.text(`Pag ${n} di ${total}`, PW / 2, PH - 7, { align: 'center' });
  doc.text(fmtNow(), PW - M, PH - 7, { align: 'right' });
}

function kpiBox(doc, x, y, w, h, label, value, sub, valColor = DARK) {
  box(doc, x, y, w, h, '#F9FAFB', LGRAY, 3);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); tc(doc, GRAY);
  doc.text(label.toUpperCase(), x + 4, y + 7);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); tc(doc, valColor);
  doc.text(String(value), x + 4, y + 20);
  if (sub) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); tc(doc, GRAY);
    doc.text(sub, x + 4, y + h - 4, { maxWidth: w - 8 });
  }
}

// ── Data computation ────────────────────────────────────────────────────────────

function computeAll(reviews) {
  const total = reviews.length;
  const rated = reviews.filter(r => r.stelle).map(r => Number(r.stelle));
  const avgRating = avg(rated);
  const c5  = reviews.filter(r => Number(r.stelle) === 5).length;
  const c12 = reviews.filter(r => [1, 2].includes(Number(r.stelle))).length;
  const satScore = total ? Math.round((c5 - c12) / total * 100) : 0;

  const loyalCount  = reviews.filter(r => r.prima_prenotazione === false).length;
  const loyaltyRate = total ? Math.round(loyalCount / total * 100) : 0;

  // Topics
  const topicMap = new Map();
  reviews.forEach(r => (r.topic || []).forEach(t => topicMap.set(t, (topicMap.get(t) || 0) + 1)));
  const topicsSorted = [...topicMap.entries()].sort((a, b) => b[1] - a[1]);

  // Segments
  const segMap = {};
  SEG_ORDER.forEach(s => { segMap[s] = { count: 0, starSum: 0, starCount: 0 }; });
  reviews.forEach(r => {
    if (!segMap[r.segmento]) return;
    segMap[r.segmento].count++;
    if (r.stelle) { segMap[r.segmento].starSum += Number(r.stelle); segMap[r.segmento].starCount++; }
  });
  const segStats = SEG_ORDER.map(s => ({
    seg: s, label: SEG_LABELS[s], color: SEG_COLORS[s],
    count: segMap[s].count,
    pct: total > 0 ? Math.round(segMap[s].count / total * 100) : 0,
    rating: segMap[s].starCount ? Math.round(segMap[s].starSum / segMap[s].starCount * 10) / 10 : 0,
  }));

  // Locations
  const locMap = new Map();
  reviews.forEach(r => {
    const loc = (r.localita || '').trim();
    if (!loc) return;
    if (!locMap.has(loc)) locMap.set(loc, { loc, seg: r.segmento, count: 0, starSum: 0, starCount: 0 });
    const b = locMap.get(loc);
    b.count++;
    if (r.stelle) { b.starSum += Number(r.stelle); b.starCount++; }
  });
  const topLocations = [...locMap.values()]
    .sort((a, b) => b.count - a.count).slice(0, 10)
    .map(l => ({ ...l, rating: l.starCount ? Math.round(l.starSum / l.starCount * 10) / 10 : 0 }));

  // Pyramid
  const pyramidData = [
    { label: 'Nuovi',         count: reviews.filter(r => r.n_prenotazioni_precedenti === 0).length, color: BLUE },
    { label: 'Ricorrenti',    count: reviews.filter(r => r.n_prenotazioni_precedenti > 0 && !r.cross_ever_completed_only).length, color: TEAL },
    { label: 'Cross 2 seg.', count: reviews.filter(r => r.cross_ever_completed_only && (r.segmenti_precedenti_completed?.length || 0) === 1).length, color: VIOLET },
    { label: 'Cross 3+',     count: reviews.filter(r => r.cross_ever_completed_only && (r.segmenti_precedenti_completed?.length || 0) >= 2).length, color: RED },
  ].filter(b => b.count > 0);

  // Matrix
  const matrixCells = {};
  SEG_ORDER.forEach(f => SEG_ORDER.forEach(t => { matrixCells[`${f}-${t}`] = 0; }));
  reviews.forEach(r => {
    const k = `${r.segmento_origine}-${r.segmento}`;
    if (matrixCells[k] !== undefined) matrixCells[k]++;
  });
  const matrixMax = Math.max(1, ...Object.values(matrixCells));

  // Top 5 loyalty
  const byAuthor = new Map();
  reviews.forEach(r => {
    const key = (r.autore || '').trim().toLowerCase();
    if (!key) return;
    if (!byAuthor.has(key)) byAuthor.set(key, { name: (r.autore || '').trim(), ratings: [], maxPren: null });
    const e = byAuthor.get(key);
    if (r.stelle) e.ratings.push(Number(r.stelle));
    if (r.n_prenotazioni_precedenti_completed != null && (e.maxPren === null || r.n_prenotazioni_precedenti_completed > e.maxPren))
      e.maxPren = r.n_prenotazioni_precedenti_completed;
  });
  const top5 = [...byAuthor.values()].filter(e => e.maxPren > 0)
    .map(e => {
      const parts = e.name.split(/\s+/);
      const display = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] || '?';
      return { display, pren: e.maxPren, rating: e.ratings.length ? Math.round(avg(e.ratings) * 10) / 10 : null };
    })
    .sort((a, b) => b.pren - a.pren).slice(0, 5);

  // Heatmap (current year)
  const curYear = new Date().getFullYear();
  const heatMatrix = Array.from({ length: 12 }, () => Array(7).fill(0));
  reviews.filter(r => r.data && new Date(r.data).getFullYear() === curYear).forEach(r => {
    const d = new Date(r.data.slice(0, 10) + 'T12:00:00Z');
    heatMatrix[d.getUTCMonth()][d.getUTCDay()]++;
  });
  const heatMax = Math.max(1, ...heatMatrix.flat());

  // Hours
  const hourCounts = Array(24).fill(0);
  reviews.forEach(r => { if (r.data) { const h = new Date(r.data).getUTCHours(); if (!isNaN(h)) hourCounts[h]++; } });

  // AI
  const aiGenerated = reviews.filter(r => r.risposta_generata != null).length;
  const published   = reviews.filter(r => r.risposta_pubblicata != null).length;
  const modified    = reviews.filter(r => r.risposta_modificata === true).length;
  const nonModified = published - modified;
  const autonomiaRate = published > 0 ? Math.round(nonModified / published * 100) : null;

  // Monthly trend
  const now = new Date();
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
    const inMonth = reviews.filter(r => r.risposta_pubblicata && r.pubblicata_at && r.pubblicata_at.slice(0, 7) === key);
    monthlyTrend.push({
      label,
      nonMod: inMonth.filter(r => !r.risposta_modificata).length,
      mod:    inMonth.filter(r => r.risposta_modificata).length,
      total:  inMonth.length,
    });
  }

  // Topic × segment matrix
  const tsMatrix = {};
  reviews.forEach(r => (r.topic || []).forEach(t => {
    const k = `${t}-${r.segmento}`;
    tsMatrix[k] = (tsMatrix[k] || 0) + 1;
  }));
  const tsMax = Math.max(1, ...Object.values(tsMatrix));

  return {
    total, avgRating, avgRatingStr: avgRating > 0 ? avgRating.toFixed(1) : '—',
    satScore, loyaltyRate, topicsSorted, segStats, topLocations,
    pyramidData, matrixCells, matrixMax, top5,
    heatMatrix, heatMax, hourCounts,
    aiGenerated, published, modified, nonModified, autonomiaRate,
    monthlyTrend, tsMatrix, tsMax,
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function exportToPdf({ reviews, filters, sectionRefs, onProgress }) {
  if (onProgress) onProgress(5);

  const [{ jsPDF }] = await Promise.all([import('jspdf')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let logoUrl = null;
  try {
    const resp = await fetch('/logo-pmc.png');
    const blob = await resp.blob();
    logoUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  } catch (_) {}

  const data = computeAll(reviews);
  const TOTAL = 8;
  const fromStr = fmtD(filters.from), toStr = fmtD(filters.to);

  const H = (title) => drawHeader(doc, title, fromStr, toStr, logoUrl);
  const F = (n) => drawFooter(doc, n, TOTAL);

  // ── PAGE 1: COVER ────────────────────────────────────────────────────────────
  if (onProgress) onProgress(10);

  fc(doc, '#FFF7ED'); doc.rect(0, 0, PW, PH, 'F');
  fc(doc, ORANGE);    doc.rect(0, 0, PW, 58, 'F');

  if (logoUrl) doc.addImage(logoUrl, 'PNG', (PW - 80) / 2, 10, 80, 10.26);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(30); tc(doc, WHITE);
  doc.text('Analytics Recensioni', PW / 2, 40, { align: 'center' });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(14); tc(doc, ORANGE);
  doc.text('Report Strategico · ParkingMyCar', PW / 2, 66, { align: 'center' });

  // Info box
  const bx = PW / 2 - 65, bw = 130, bh = 54;
  box(doc, bx, 74, bw, bh, WHITE, LGRAY, 4);
  const rows = [
    ['Periodo analizzato', `${fmtDLong(filters.from)} → ${fmtDLong(filters.to)}`],
    ['Recensioni totali',  data.total.toLocaleString('it-IT')],
    ['Generato',          fmtNow()],
    ['Powered by',        'Stefy Agent'],
  ];
  let ry = 84;
  rows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(doc, GRAY);
    doc.text(label, bx + 7, ry);
    doc.setFont('helvetica', 'bold'); tc(doc, DARK);
    doc.text(String(val), bx + bw - 7, ry, { align: 'right', maxWidth: bw * 0.6 });
    ry += 11;
  });

  hline(doc, M, PW - M, PH - 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(doc, GRAY);
  doc.text('Documento riservato · ParkingMyCar S.r.l.', PW / 2, PH - 7, { align: 'center' });

  // ── PAGE 2: EXECUTIVE SUMMARY ────────────────────────────────────────────────
  if (onProgress) onProgress(18);
  doc.addPage(); H('Executive Summary'); F(2);

  const CY2 = CONTENT_Y + 3;
  const kw = (CW - 9) / 4, kh = 40;

  const kpis = [
    { label: 'Recensioni totali',   value: data.total.toLocaleString('it-IT'), sub: `${fromStr} → ${toStr}`,                                                        color: DARK },
    { label: 'Rating medio',        value: data.avgRatingStr !== '—' ? `${data.avgRatingStr}/5` : '—', sub: `Score soddisfazione: ${data.satScore > 0 ? '+' : ''}${data.satScore}%`, color: ORANGE },
    { label: 'Customer Loyalty',    value: `${data.loyaltyRate}%`, sub: 'Clienti con prenotazioni precedenti',                                                       color: TEAL },
    { label: 'Autonomia AI',        value: data.autonomiaRate != null ? `${data.autonomiaRate}%` : '—', sub: `${data.published} pubblicate su ${data.aiGenerated} generate`, color: VIOLET },
  ];
  kpis.forEach((k, i) => kpiBox(doc, M + i * (kw + 3), CY2, kw, kh, k.label, k.value, k.sub, k.color));

  // Highlights
  let hy = CY2 + kh + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); tc(doc, DARK);
  doc.text('Highlight del periodo', M, hy);
  hline(doc, M, PW - M, hy + 2);
  hy += 9;

  const topSeg = [...data.segStats].sort((a, b) => b.count - a.count)[0];
  const topLoc = data.topLocations[0];
  const topTopic = data.topicsSorted[0];
  const bullets = [
    `Topic piu citato: ${topTopic ? (TOPIC_LABELS[topTopic[0]] || topTopic[0]) + ` — ${topTopic[1]} citazioni` : '—'}`,
    `Top location: ${topLoc ? `${topLoc.loc} (${topLoc.count} recensioni, rating ${topLoc.rating.toFixed(1)})` : '—'}`,
    `Segmento principale: ${topSeg ? `${topSeg.label} — ${topSeg.pct}% del volume (${topSeg.count} recensioni)` : '—'}`,
    `Stefy Agent genera risposte per il ${fmtRate(data.aiGenerated, data.total)} delle recensioni`,
  ];
  bullets.forEach(txt => {
    fc(doc, ORANGE); doc.circle(M + 2.5, hy - 1.5, 1.2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); tc(doc, DARK);
    doc.text(txt, M + 7, hy, { maxWidth: CW - 7 });
    hy += 9;
  });

  // ── PAGE 3: SEGMENTI & LOCATION ──────────────────────────────────────────────
  if (onProgress) onProgress(28);
  doc.addPage(); H('Segmenti & Location'); F(3);

  const CY3 = CONTENT_Y + 3;
  // Donut
  const dCX = M + COL_W / 2 - 5, dCY = CY3 + 48, dOR = 38, dIR = 19;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, DARK);
  doc.text('Distribuzione segmenti', M, CY3 + 2);

  donut(doc, dCX, dCY, dOR, dIR, data.segStats.filter(s => s.count > 0).map(s => ({ value: s.count, color: s.color })));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); tc(doc, DARK);
  doc.text(String(data.total), dCX, dCY + 3, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); tc(doc, GRAY);
  doc.text('totale', dCX, dCY + 8, { align: 'center' });

  let legY = dCY + dOR + 8;
  data.segStats.filter(s => s.count > 0).forEach(s => {
    fc(doc, s.color); doc.rect(M, legY - 3, 4, 4, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); tc(doc, DARK);
    doc.text(s.label, M + 6, legY);
    doc.setFont('helvetica', 'bold');
    doc.text(`${s.pct}%`, M + COL_W - 18, legY);
    doc.setFont('helvetica', 'normal'); tc(doc, GRAY);
    doc.text(`(${s.count})`, M + COL_W - 2, legY, { align: 'right' });
    legY += 9;
  });

  // Top 10 table
  const tX = M + COL_W + COL2_GAP, tW = COL_W;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, DARK);
  doc.text('Top 10 Location per volume', tX, CY3 + 2);

  fc(doc, '#F3F4F6'); doc.rect(tX, CY3 + 5, tW, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(doc, GRAY);
  doc.text('LOCATION', tX + 2, CY3 + 9.5);
  doc.text('N', tX + tW - 22, CY3 + 9.5);
  doc.text('RATING', tX + tW - 2, CY3 + 9.5, { align: 'right' });

  let tblY = CY3 + 11;
  data.topLocations.forEach((loc, i) => {
    if (i % 2 === 0) { fc(doc, '#F9FAFB'); doc.rect(tX, tblY, tW, 7, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(doc, DARK);
    const name = loc.loc.length > 30 ? loc.loc.slice(0, 28) + '…' : loc.loc;
    doc.text(`${i + 1}. ${name}`, tX + 2, tblY + 4.5);
    const sc = SEG_COLORS[loc.seg] || GRAY;
    fc(doc, sc); doc.circle(tX + tW - 28, tblY + 3.2, 1.5, 'F');
    tc(doc, DARK);
    doc.text(String(loc.count), tX + tW - 22, tblY + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.text(loc.rating > 0 ? loc.rating.toFixed(1) : '—', tX + tW - 2, tblY + 4.5, { align: 'right' });
    tblY += 7;
  });

  // ── PAGE 4: TOPIC ANALYSIS ────────────────────────────────────────────────────
  if (onProgress) onProgress(38);
  doc.addPage(); H('Cosa dicono i clienti — Topic Analysis'); F(4);

  const CY4 = CONTENT_Y + 3;
  const topTopics = data.topicsSorted.slice(0, 11);
  const topicMax  = topTopics[0]?.[1] || 1;
  const barMaxW   = COL_W + 20;
  const bH = 5.5, bGap = 2.5;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, DARK);
  doc.text('Volume per topic', M, CY4 + 2);

  let tbY = CY4 + 8;
  topTopics.forEach(([topic, count]) => {
    const lbl   = TOPIC_LABELS[topic] || topic;
    const color = TOPIC_COLORS[topic] || GRAY;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(doc, DARK);
    doc.text(lbl, M, tbY + bH - 1.5);
    hbar(doc, M + 40, tbY, barMaxW, bH, count, topicMax, color);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); tc(doc, DARK);
    doc.text(String(count), M + 40 + barMaxW + 3, tbY + bH - 1.5);
    tbY += bH + bGap;
  });

  // Topic × segment heatmap (right side)
  const htX  = M + barMaxW + 52;
  const htAvW = PW - M - htX;
  const activeSeg = data.segStats.filter(s => s.count > 0);

  if (htAvW > 35 && activeSeg.length > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); tc(doc, DARK);
    doc.text('Topic × Segmento', htX, CY4 + 2);

    const cW2 = Math.min(20, (htAvW - 30) / activeSeg.length);
    const cH2 = 5.5;

    activeSeg.forEach((s, si) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); tc(doc, s.color);
      doc.text(s.label, htX + 28 + si * cW2 + cW2 / 2, CY4 + 9, { align: 'center' });
    });

    let hty = CY4 + 11;
    topTopics.forEach(([topic]) => {
      const lbl = (TOPIC_LABELS[topic] || topic).slice(0, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); tc(doc, GRAY);
      doc.text(lbl, htX, hty + cH2 - 1);
      activeSeg.forEach((s, si) => {
        const val = data.tsMatrix[`${topic}-${s.seg}`] || 0;
        heatCell(doc, htX + 28 + si * cW2, hty, cW2 - 0.5, cH2 - 0.5, val, data.tsMax, ORANGE);
        if (val > 0) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5);
          tc(doc, val / data.tsMax > 0.6 ? WHITE : DARK);
          doc.text(String(val), htX + 28 + si * cW2 + cW2 / 2, hty + cH2 - 1.2, { align: 'center' });
        }
      });
      hty += cH2 + 0.5;
    });
  }

  // ── PAGE 5: CUSTOMER JOURNEY ──────────────────────────────────────────────────
  if (onProgress) onProgress(48);
  doc.addPage(); H('Customer Journey'); F(5);

  const CY5 = CONTENT_Y + 3;

  // Pyramid (left)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, DARK);
  doc.text('Piramide clienti', M, CY5 + 2);

  const pyrH = 55, pyrBaseY = CY5 + pyrH + 10;
  const pyrMax = Math.max(1, ...data.pyramidData.map(b => b.count));
  const pyrBW  = data.pyramidData.length > 0 ? Math.min(24, (COL_W - 10) / data.pyramidData.length) : 24;

  data.pyramidData.forEach((b, i) => {
    const bx = M + 4 + i * (pyrBW + 5);
    vbar(doc, bx, pyrBaseY, pyrBW, pyrH, b.count, pyrMax, b.color);
    const barH = pyrMax > 0 ? (b.count / pyrMax) * pyrH : 0;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); tc(doc, b.color);
    doc.text(String(b.count), bx + pyrBW / 2, pyrBaseY - barH - 2, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); tc(doc, GRAY);
    doc.text(`${Math.round(b.count / data.total * 100)}%`, bx + pyrBW / 2, pyrBaseY - barH - 6.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); tc(doc, DARK);
    doc.text(b.label, bx + pyrBW / 2, pyrBaseY + 5, { align: 'center', maxWidth: pyrBW + 5 });
  });

  // Matrix (right)
  const mX = M + COL_W + COL2_GAP;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, DARK);
  doc.text('Matrice transizioni', mX, CY5 + 2);

  const mCS = 19, mLW = 20;
  SEG_ORDER.forEach((to, ti) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(doc, SEG_COLORS[to]);
    doc.text(SEG_LABELS[to], mX + mLW + ti * mCS + mCS / 2, CY5 + 10, { align: 'center' });
  });
  SEG_ORDER.forEach((from, fi) => {
    const rowY = CY5 + 13 + fi * mCS;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(doc, SEG_COLORS[from]);
    doc.text(SEG_LABELS[from], mX, rowY + mCS / 2 + 2);
    SEG_ORDER.forEach((to, ti) => {
      const cx2 = mX + mLW + ti * mCS;
      const val  = data.matrixCells[`${from}-${to}`] || 0;
      const t    = val > 0 ? Math.min(val / data.matrixMax, 1) : 0;
      const isDiag = from === to;
      if (t === 0) { fc(doc, '#F3F4F6'); }
      else {
        const base = hexRgb(isDiag ? VIOLET : BLUE);
        doc.setFillColor(
          Math.round(255 + (base.r - 255) * (0.15 + t * 0.7)),
          Math.round(255 + (base.g - 255) * (0.15 + t * 0.7)),
          Math.round(255 + (base.b - 255) * (0.15 + t * 0.7)),
        );
      }
      doc.rect(cx2, rowY, mCS - 0.5, mCS - 0.5, 'F');
      if (val > 0) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        tc(doc, t > 0.55 ? WHITE : DARK);
        doc.text(String(val), cx2 + mCS / 2, rowY + mCS / 2 + 2.5, { align: 'center' });
      }
    });
  });

  // Top 5 loyalty
  const ly = pyrBaseY + 12;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, DARK);
  doc.text('Top 5 clienti per fedelta', M, ly);
  hline(doc, M, PW - M, ly + 2);

  if (data.top5.length > 0) {
    const cw5 = CW / 5;
    data.top5.forEach((c, i) => {
      const lbx = M + i * cw5;
      box(doc, lbx, ly + 5, cw5 - 3, 24, '#F9FAFB', LGRAY, 2);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); tc(doc, DARK);
      doc.text(c.display, lbx + (cw5 - 3) / 2, ly + 14, { align: 'center', maxWidth: cw5 - 6 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); tc(doc, GRAY);
      doc.text(`${c.pren} prenotazioni`, lbx + (cw5 - 3) / 2, ly + 20, { align: 'center' });
      if (c.rating) {
        doc.setFont('helvetica', 'bold'); tc(doc, ORANGE);
        doc.text(`${c.rating.toFixed(1)}/5`, lbx + (cw5 - 3) / 2, ly + 26, { align: 'center' });
      }
    });
  }

  // ── PAGE 6: TEMPISTICHE ───────────────────────────────────────────────────────
  if (onProgress) onProgress(58);
  doc.addPage(); H(`Tempistiche & Stagionalita ${new Date().getFullYear()}`); F(6);

  const CY6 = CONTENT_Y + 3;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, DARK);
  doc.text(`Stagionalita ${new Date().getFullYear()} — mese × giorno settimana`, M, CY6 + 2);

  const hmCW = 20, hmCH = 6.5, hmLW = 11, hmSX = M + hmLW + 2, hmSY = CY6 + 8;

  DOW_ORDER.forEach((d, di) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(doc, GRAY);
    doc.text(DOW_S[di], hmSX + di * hmCW + hmCW / 2, hmSY - 1, { align: 'center' });
  });
  MONTH_S.forEach((ml, mi) => {
    const rowY = hmSY + mi * hmCH;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(doc, GRAY);
    doc.text(ml, M, rowY + hmCH - 2);
    DOW_ORDER.forEach((d, di) => {
      const val = data.heatMatrix[mi][d];
      heatCell(doc, hmSX + di * hmCW, rowY, hmCW - 0.5, hmCH - 0.5, val, data.heatMax, ORANGE);
      if (val > 0) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
        tc(doc, val / data.heatMax > 0.55 ? WHITE : DARK);
        doc.text(String(val), hmSX + di * hmCW + hmCW / 2, rowY + hmCH - 1.5, { align: 'center' });
      }
    });
  });

  // Hour distribution (right side)
  const hrX = hmSX + DOW_ORDER.length * hmCW + 8;
  const hrAvW = PW - M - hrX;

  if (hrAvW > 30) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); tc(doc, DARK);
    doc.text('Distribuzione oraria', hrX, CY6 + 2);
    const hrBarW = hrAvW - 22, hrBH = 3.8, hrBGap = 1.2;
    const hrMax  = Math.max(1, ...data.hourCounts);
    let hrbY = CY6 + 8;
    const showHrs = Array.from({ length: 24 }, (_, h) => h).filter(h => h >= 5 && h <= 23);
    showHrs.forEach(h => {
      const cnt = data.hourCounts[h];
      if (hrbY > CY6 + 95) return;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); tc(doc, GRAY);
      doc.text(`${h}h`, hrX, hrbY + hrBH - 0.5);
      hbar(doc, hrX + 10, hrbY, hrBarW, hrBH, cnt, hrMax, cnt > 0 ? BLUE : LGRAY);
      if (cnt > 0) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); tc(doc, DARK);
        doc.text(String(cnt), hrX + 10 + hrBarW + 2, hrbY + hrBH - 0.5);
      }
      hrbY += hrBH + hrBGap;
    });
  }

  // ── PAGE 7: AI & STEFY AGENT ─────────────────────────────────────────────────
  if (onProgress) onProgress(70);
  doc.addPage(); H('Stefy Agent — AI Responses'); F(7);

  const CY7 = CONTENT_Y + 3;
  const ai4 = [
    { label: 'Stefy Agent generate', value: data.aiGenerated.toLocaleString('it-IT'), sub: `${fmtRate(data.aiGenerated, data.total)} delle recensioni`,       color: VIOLET },
    { label: 'Pubblicate',           value: data.published.toLocaleString('it-IT'),   sub: `${fmtRate(data.published, data.aiGenerated)} delle generate`,       color: data.published / Math.max(data.aiGenerated, 1) < 0.1 ? RED : TEAL },
    { label: 'Modificate da Stefania',value: `${data.modified}/${data.published}`,    sub: `${fmtRate(data.modified, data.published)} delle pubblicate`,         color: ORANGE },
    { label: 'Autonomia AI',         value: data.autonomiaRate != null ? `${data.autonomiaRate}%` : '—', sub: `${data.nonModified} pubblicate senza modifica`, color: GREEN },
  ];
  const kvH = 27, kvGap = 4;
  ai4.forEach((k, i) => kpiBox(doc, M, CY7 + i * (kvH + kvGap), COL_W, kvH, k.label, k.value, k.sub, k.color));

  // Funnel
  const fX = M + COL_W + COL2_GAP;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, DARK);
  doc.text('Funnel di pubblicazione', fX, CY7 + 2);

  const funnelSteps = [
    { label: 'Recensioni totali',  count: data.total,       pct: 100, color: LGRAY },
    { label: 'Stefy Agent genera', count: data.aiGenerated, pct: data.total > 0 ? Math.round(data.aiGenerated / data.total * 100) : 0, color: VIOLET },
    { label: 'Risposta pubblicata',count: data.published,   pct: data.aiGenerated > 0 ? Math.round(data.published / data.aiGenerated * 100) : 0, color: data.published / Math.max(data.aiGenerated, 1) < 0.2 ? RED : TEAL },
  ];
  const fBarW = COL_W - 45;
  let fY = CY7 + 8;
  funnelSteps.forEach(step => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(doc, DARK);
    doc.text(step.label, fX, fY + 5);
    hbar(doc, fX, fY + 7, fBarW, 7, step.pct, 100, step.color);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); tc(doc, DARK);
    doc.text(step.count.toLocaleString('it-IT'), fX + fBarW + 3, fY + 12);
    doc.setFont('helvetica', 'normal'); tc(doc, GRAY);
    doc.text(`${step.pct}%`, fX + fBarW + 22, fY + 12);
    fY += 20;
  });

  // Monthly trend
  const trendY = fY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); tc(doc, DARK);
  doc.text('Andamento mensile autonomia', fX, trendY);
  hline(doc, fX, fX + COL_W, trendY + 2);

  const tmH = 32, tmBW = (COL_W - 4) / data.monthlyTrend.length;
  const tmMax = Math.max(1, ...data.monthlyTrend.map(m => m.total));
  const tmBaseY = trendY + tmH + 6;

  data.monthlyTrend.forEach((m, i) => {
    const bx2 = fX + i * tmBW + 1;
    const bw2 = tmBW - 2;
    if (m.total > 0) {
      const totH = (m.total / tmMax) * tmH;
      const modH = totH * (m.mod / m.total);
      const nmH  = totH * (m.nonMod / m.total);
      if (modH > 0) { fc(doc, ORANGE); doc.rect(bx2, tmBaseY - totH, bw2, modH, 'F'); }
      if (nmH  > 0) { fc(doc, VIOLET); doc.rect(bx2, tmBaseY - totH + modH, bw2, nmH, 'F'); }
    } else {
      fc(doc, '#F3F4F6'); doc.rect(bx2, tmBaseY - 2, bw2, 2, 'F');
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); tc(doc, GRAY);
    doc.text(m.label, bx2 + bw2 / 2, tmBaseY + 5, { align: 'center' });
  });

  // Legend
  fc(doc, VIOLET); doc.rect(fX, tmBaseY + 9, 4, 3.5, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); tc(doc, DARK);
  doc.text('AI autonoma', fX + 6, tmBaseY + 12);
  fc(doc, ORANGE); doc.rect(fX + 38, tmBaseY + 9, 4, 3.5, 'F');
  doc.text('Modificata da Stefania', fX + 44, tmBaseY + 12);

  // ── PAGE 8: CONCLUSIONI ───────────────────────────────────────────────────────
  if (onProgress) onProgress(85);
  doc.addPage(); H('Conclusioni & Next Steps'); F(8);

  const CY8 = CONTENT_Y + 3;

  // Generate bullets
  const strengths = [], improvements = [];
  if (data.avgRating >= 4.5)  strengths.push(`Rating medio eccellente: ${data.avgRatingStr}/5 — servizio percepito come premium.`);
  else if (data.avgRating > 0) improvements.push(`Rating medio ${data.avgRatingStr}/5 — margine di miglioramento nella qualita percepita.`);
  if (data.satScore >= 80)    strengths.push(`Score soddisfazione molto alto: +${data.satScore}% — pochi clienti insoddisfatti.`);
  else if (data.satScore < 50) improvements.push(`Score soddisfazione ${data.satScore}% — incrementare le recensioni 5 stelle.`);
  if (data.loyaltyRate >= 60) strengths.push(`Alta fedelta clienti: ${data.loyaltyRate}% ha gia prenotato in passato.`);
  else if (data.loyaltyRate < 30) improvements.push(`Bassa loyalty ${data.loyaltyRate}% — attivare campagne di fidelizzazione.`);
  if (data.aiGenerated > data.total * 0.85) strengths.push(`Stefy Agent copre il ${fmtRate(data.aiGenerated, data.total)} delle recensioni con una risposta generata.`);
  const pubRatio = data.aiGenerated > 0 ? data.published / data.aiGenerated : 0;
  if (pubRatio < 0.1) improvements.push(`Solo il ${fmtRate(data.published, data.aiGenerated)} delle risposte AI viene pubblicato — collo di bottiglia operativo da risolvere.`);
  else if (pubRatio > 0.5) strengths.push(`Buon tasso di pubblicazione risposte: ${fmtRate(data.published, data.aiGenerated)}.`);
  if (data.autonomiaRate != null && data.autonomiaRate >= 70) strengths.push(`Alta autonomia AI: ${data.autonomiaRate}% delle risposte pubblicate senza modifica umana.`);
  else if (data.autonomiaRate != null && data.autonomiaRate < 40) improvements.push(`Frequenti modifiche umane (autonomia ${data.autonomiaRate}%) — ottimizzare il prompt di Stefy Agent.`);
  if (topSeg) strengths.push(`Segmento ${topSeg.label} dominante con ${topSeg.pct}% del volume (${topSeg.count} recensioni).`);
  if (topLoc)  strengths.push(`Location piu attiva: ${topLoc.loc} — ${topLoc.count} recensioni con rating ${topLoc.rating.toFixed(1)}.`);
  if (!strengths.length) strengths.push('Continuare il monitoraggio — dati in crescita nel periodo analizzato.');
  if (!improvements.length) improvements.push('Incrementare il tasso di pubblicazione delle risposte AI generate.');

  const halfW = (CW - 6) / 2;
  const bxH   = CONTENT_H - 8;

  // Strengths
  fc(doc, '#ECFDF5'); dc(doc, GREEN); doc.setLineWidth(0.5);
  doc.roundedRect(M, CY8 + 4, halfW, bxH, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, GREEN);
  doc.text('Punti di forza', M + 6, CY8 + 13);
  hline(doc, M + 4, M + halfW - 4, CY8 + 15, GREEN, 0.5);
  let sy = CY8 + 22;
  strengths.slice(0, 6).forEach(txt => {
    fc(doc, GREEN); doc.circle(M + 8, sy - 2, 1.2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(doc, DARK);
    const ls = doc.splitTextToSize(txt, halfW - 18);
    doc.text(ls, M + 12, sy);
    sy += ls.length * 5.5 + 3;
  });

  // Improvements
  const impX = M + halfW + 6;
  fc(doc, '#FFF7ED'); dc(doc, ORANGE); doc.setLineWidth(0.5);
  doc.roundedRect(impX, CY8 + 4, halfW, bxH, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(doc, ORANGE);
  doc.text('Aree di miglioramento', impX + 6, CY8 + 13);
  hline(doc, impX + 4, impX + halfW - 4, CY8 + 15, ORANGE, 0.5);
  let iy = CY8 + 22;
  improvements.slice(0, 6).forEach(txt => {
    fc(doc, ORANGE); doc.circle(impX + 8, iy - 2, 1.2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(doc, DARK);
    const li = doc.splitTextToSize(txt, halfW - 18);
    doc.text(li, impX + 12, iy);
    iy += li.length * 5.5 + 3;
  });

  // Disclaimer
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); tc(doc, GRAY);
  doc.text('Generato automaticamente da AI Agency Platform · Stefy Agent', PW / 2, PH - 18, { align: 'center' });

  if (onProgress) onProgress(100);
  doc.save(`analytics-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
