export function formatDate(value) {
  if (!value) return 'n.d.';

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function statusLabel(status) {
  const labels = {
    pending: 'In attesa',
    approved: 'Approvata',
    published: 'Pubblicata',
    skipped: 'Scartata',
  };

  return labels[status] || status || 'Sconosciuto';
}

export function getStatusCount(stats, status) {
  return stats?.per_stato?.find((item) => item.stato === status)?.n || 0;
}

export function getTotalReviews(stats) {
  return stats?.per_stato?.reduce((acc, item) => acc + item.n, 0) || 0;
}

export function formatPercent(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}
