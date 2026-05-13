export const SEGMENTO_CFG = {
  airport: { label: 'Airport', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  port:    { label: 'Port',    cls: 'bg-teal-50 text-teal-700 ring-teal-200' },
  city:    { label: 'City',    cls: 'bg-neutral-100 text-neutral-600 ring-neutral-200' },
  station: { label: 'Station', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

export function getSegmentoConfig(segmento) {
  return SEGMENTO_CFG[segmento] || null;
}

export function isMatched(review) {
  return review?.enrichment_status === 'matched';
}
