import { classNames, statusLabel } from '../lib/utils';

const topicColors = [
  'bg-brand-50 text-brand-800 ring-brand-200',
  'bg-neutral-100 text-neutral-700 ring-neutral-200',
  'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'bg-red-50 text-red-700 ring-red-200',
  'bg-amber-50 text-amber-800 ring-amber-200',
];

const statusColors = {
  pending: 'bg-brand-50 text-brand-800 ring-brand-200',
  approved: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  skipped: 'bg-red-50 text-red-700 ring-red-200',
};

export function StatusBadge({ status }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
        statusColors[status] || 'bg-neutral-100 text-neutral-700 ring-neutral-200'
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function TopicBadge({ topic, index = 0 }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
        topicColors[index % topicColors.length]
      )}
    >
      {topic}
    </span>
  );
}

export function FlagBadge({ active, children }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
        active
          ? 'bg-brand-100 text-brand-800 ring-brand-200'
          : 'bg-neutral-100 text-neutral-500 ring-neutral-200'
      )}
    >
      {children}: {active ? 'Sì' : 'No'}
    </span>
  );
}
