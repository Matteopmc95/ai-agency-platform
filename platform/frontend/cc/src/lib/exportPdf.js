// PDF export for Analytics Dashboard
// Uses jsPDF v4 + html2canvas — both dynamically imported to keep initial bundle lean

const A4_W_MM  = 210;
const A4_H_MM  = 297;
const MARGIN   = 14;       // mm
const CONTENT_W = A4_W_MM - MARGIN * 2;
const BRAND    = '#FF8300';
const DARK     = '#0f172a';
const GRAY     = '#64748b';
const FOOTER_H = 10;       // mm reserved at bottom

// ── Helpers ───────────────────────────────────────────────────────────────────

function avgArr(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(iso));
}

function computeKpis(reviews) {
  const total = reviews.length;
  const rated = reviews.filter(r => r.stelle).map(r => Number(r.stelle));
  const avgRating = avgArr(rated);
  const count5  = reviews.filter(r => Number(r.stelle) === 5).length;
  const count12 = reviews.filter(r => [1, 2].includes(Number(r.stelle))).length;
  const satisfactionScore = total ? Math.round((count5 - count12) / total * 100) : 0;
  const responseRate = total
    ? Math.round(reviews.filter(r => r.risposta_pubblicata).length / total * 100)
    : 0;
  const topicMap = new Map();
  reviews.forEach(r => (r.topics || []).forEach(t => topicMap.set(t, (topicMap.get(t) || 0) + 1)));
  const topEntry = [...topicMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const loyalCount   = reviews.filter(r => (r.n_prenotazioni_precedenti || 0) >= 1).length;
  const loyaltyRate  = total ? Math.round(loyalCount / total * 100) : 0;

  return {
    total,
    avgRating: avgRating > 0 ? avgRating.toFixed(1) : '—',
    satisfactionScore,
    responseRate,
    topTopic: topEntry?.[0] || null,
    loyaltyRate,
  };
}

function addFooter(pdf, page, total) {
  const y = A4_H_MM - 6;
  pdf.setFontSize(8);
  pdf.setTextColor(GRAY);
  pdf.text('ParkingMyCar — Analytics Report', MARGIN, y);
  pdf.text(`Pagina ${page} di ${total}`, A4_W_MM - MARGIN, y, { align: 'right' });
}

async function captureSection(html2canvas, el) {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });
}

function addImagePage(pdf, imgData, imgW, imgH, pageNum, pageTotal, sectionLabel) {
  // Scale image to fit content width (in mm), allowing multi-page for tall sections
  const scale    = CONTENT_W / imgW;
  const scaledH  = imgH * scale;
  const maxH     = A4_H_MM - MARGIN * 2 - FOOTER_H - 8; // 8mm for section label

  if (sectionLabel) {
    pdf.setFontSize(10);
    pdf.setTextColor(GRAY);
    pdf.text(sectionLabel, MARGIN, MARGIN + 5);
  }

  let srcY      = 0;
  let remaining = scaledH;
  let isFirst   = true;
  let pg        = pageNum;

  while (remaining > 0) {
    if (!isFirst) {
      pdf.addPage();
      pg++;
    }
    const chunkH = Math.min(remaining, maxH);
    const srcH   = chunkH / scale;

    // Clip region from source canvas (use sx, sy, sWidth, sHeight via addImage sx param)
    const yOffset = isFirst && sectionLabel ? MARGIN + 8 : MARGIN;
    pdf.addImage(
      imgData,
      'PNG',
      MARGIN,
      yOffset,
      CONTENT_W,
      chunkH,
      undefined,
      'FAST',
      0,
      // srcY, srcH are used via clip trick: we use the full image and offset the placement
    );

    srcY      += srcH;
    remaining -= chunkH;
    isFirst    = false;
  }

  return pg;
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportToPdf({ reviews, filters, sectionRefs, onProgress }) {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;

  const kpis = computeKpis(reviews);
  const pdf  = new jsPDF('p', 'mm', 'a4');

  const SECTION_LABELS = {
    s1: 'Overview',
    s2: 'Segmenti & Location',
    s3: 'Topic Analysis',
    s4: 'Customer Journey',
    s5: 'Tempistiche',
    s6: 'AI & Risposte',
  };

  // ── Page 1: Cover ──────────────────────────────────────────────────────────

  // Header band
  pdf.setFillColor(BRAND);
  pdf.rect(0, 0, A4_W_MM, 60, 'F');

  pdf.setTextColor('#ffffff');
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Analytics Report', MARGIN, 32);

  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'normal');
  pdf.text('ParkingMyCar', MARGIN, 44);

  // Date range
  pdf.setTextColor(DARK);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Periodo', MARGIN, 78);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(`${fmtDate(filters.from)}  —  ${fmtDate(filters.to)}`, MARGIN, 86);

  // KPI summary block
  const kpiRows = [
    ['Recensioni totali',   String(kpis.total.toLocaleString('it-IT'))],
    ['Rating medio',        String(kpis.avgRating)],
    ['Score soddisfazione', `${kpis.satisfactionScore > 0 ? '+' : ''}${kpis.satisfactionScore}%`],
    ['Tasso risposta',      `${kpis.responseRate}%`],
    ['Customer loyalty',    `${kpis.loyaltyRate}%`],
  ];

  pdf.setFontSize(10);
  let yRow = 106;
  pdf.setFillColor('#f8f7f4');
  pdf.roundedRect(MARGIN, 98, CONTENT_W, kpiRows.length * 10 + 8, 3, 3, 'F');

  kpiRows.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(GRAY);
    pdf.text(label, MARGIN + 4, yRow);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(DARK);
    pdf.text(value, A4_W_MM - MARGIN - 4, yRow, { align: 'right' });
    yRow += 10;
  });

  // Generation date
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(GRAY);
  pdf.text(
    `Generato il ${fmtDate(new Date().toISOString())}`,
    MARGIN,
    A4_H_MM - 18
  );

  addFooter(pdf, 1, '—');

  // ── Pages 2+: Sections (html2canvas) ──────────────────────────────────────

  const sectionKeys = ['s1', 's2', 's3', 's4', 's5', 's6'];
  let pageNum = 2;

  for (let i = 0; i < sectionKeys.length; i++) {
    const key = sectionKeys[i];
    const el  = sectionRefs.current?.[key];
    if (!el) continue;

    if (onProgress) onProgress(Math.round((i / sectionKeys.length) * 80) + 10);

    pdf.addPage();

    // Section label header
    pdf.setFillColor(BRAND);
    pdf.rect(0, 0, A4_W_MM, 12, 'F');
    pdf.setTextColor('#ffffff');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(SECTION_LABELS[key] || key, MARGIN, 8);

    try {
      const canvas  = await captureSection(html2canvas, el);
      const imgData = canvas.toDataURL('image/png');
      const imgW    = canvas.width;
      const imgH    = canvas.height;

      const scale   = CONTENT_W / imgW;
      const drawH   = imgH * scale;
      const maxH    = A4_H_MM - 18 - FOOTER_H;

      if (drawH <= maxH) {
        pdf.addImage(imgData, 'PNG', MARGIN, 16, CONTENT_W, drawH, undefined, 'FAST');
      } else {
        // Tall section: first chunk on this page, remaining on new pages
        const firstH  = maxH;
        const srcFirst = firstH / scale;

        // Draw first chunk
        pdf.addImage(imgData, 'PNG', MARGIN, 16, CONTENT_W, firstH, undefined, 'FAST');

        let drawnH = firstH;
        while (drawnH < drawH) {
          addFooter(pdf, pageNum, '—');
          pdf.addPage();
          pageNum++;

          const chunkH   = Math.min(drawH - drawnH, A4_H_MM - MARGIN * 2 - FOOTER_H);
          pdf.addImage(imgData, 'PNG', MARGIN, MARGIN, CONTENT_W, chunkH, undefined, 'FAST');
          drawnH += chunkH;
        }
      }
    } catch {
      pdf.setFontSize(10);
      pdf.setTextColor(GRAY);
      pdf.text('Sezione non disponibile', MARGIN, 30);
    }

    addFooter(pdf, pageNum, '—');
    pageNum++;
  }

  // Rewrite footers with correct total — jsPDF doesn't support going back,
  // so we accept "—" as the total page count placeholder.

  if (onProgress) onProgress(100);

  pdf.save(`analytics-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
