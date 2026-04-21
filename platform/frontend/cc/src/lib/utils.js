export function formatDate(value) {
  if (!value) return 'n.d.';

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatLongDate(value = new Date()) {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatShortDate(value) {
  if (!value) return 'n.d.';

  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export const sourceLabels = {
  trustpilot: 'Trustpilot',
  playstore: 'Android',
  apple: 'iOS',
  google: 'GMB',
};

export function getSourceLabel(source) {
  return sourceLabels[source] || 'Fonte sconosciuta';
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

export const segmentLabels = {
  airport: 'Aeroporto',
  port: 'Porto',
  station: 'Stazione',
  city: 'Città',
};

export const segmentColors = {
  airport: '#FF8300',
  port: '#8B1E3F',
  station: '#16A34A',
  city: '#EAB308',
  unknown: '#737373',
};

export const topicCatalog = [
  'facilità',
  'velocità',
  'posizione',
  'parcheggio',
  'convenienza',
  'generico',
  'customer care',
  'app',
  'servizi',
  'cancellazione',
  'rimborso',
  'sicurezza',
  'pagamento in parcheggio',
];

export const topicLabelMap = {
  facilità: 'Facilità',
  velocità: 'Velocità',
  posizione: 'Posizione',
  parcheggio: 'Parcheggio',
  convenienza: 'Convenienza',
  generico: 'Generico',
  'customer care': 'Customer Care',
  app: 'App',
  servizi: 'Servizi',
  cancellazione: 'Cancellazione',
  rimborso: 'Rimborso',
  sicurezza: 'Sicurezza',
  'pagamento in parcheggio': 'Pagamento in parcheggio',
};

export const topicColors = {
  facilità: '#FF8300',
  velocità: '#CC6500',
  posizione: '#0F766E',
  parcheggio: '#2563EB',
  convenienza: '#7C3AED',
  generico: '#6B7280',
  'customer care': '#DC2626',
  app: '#DB2777',
  servizi: '#0891B2',
  cancellazione: '#F97316',
  rimborso: '#14B8A6',
  sicurezza: '#16A34A',
  'pagamento in parcheggio': '#A16207',
};

export function getSegmentLabel(segment) {
  return segmentLabels[segment] || 'Segmento non disponibile';
}

export function getSegmentColor(segment) {
  return segmentColors[segment] || segmentColors.unknown;
}

export function getTopicLabel(topic) {
  if (!topic) return 'Topic non disponibile';
  const normalized = topic.trim().toLowerCase();
  return topicLabelMap[normalized] || topic;
}

export function getTopicColor(topic) {
  if (!topic) return '#737373';
  const normalized = topic.trim().toLowerCase();
  return topicColors[normalized] || '#737373';
}

export function getUserName(email) {
  if (!email) return 'Operatore';

  const localPart = email.split('@')[0] || 'operatore';
  return localPart
    .split(/[.\-_]/g)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

export function truncateText(value, maxLength = 100) {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

export function getVisibleTopics(topics = [], max = 3) {
  return {
    visible: topics.slice(0, max),
    hiddenCount: Math.max(0, topics.length - max),
  };
}

export function getAverageStars(stats) {
  const items = stats?.per_stelle || [];
  const total = items.reduce((sum, item) => sum + item.n, 0);
  if (!total) return 0;

  const weighted = items.reduce((sum, item) => sum + item.stelle * item.n, 0);
  return weighted / total;
}

export function getReviewsTodayCount(reviews = []) {
  const today = new Date();
  return reviews.filter((review) => {
    const current = new Date(review.data);
    return current.getFullYear() === today.getFullYear()
      && current.getMonth() === today.getMonth()
      && current.getDate() === today.getDate();
  }).length;
}

export function getStarDistribution(stats) {
  const map = new Map((stats?.per_stelle || []).map((item) => [Number(item.stelle), item.n || 0]));

  return [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    label: `${stars} stelle`,
    value: map.get(stars) || 0,
  }));
}
