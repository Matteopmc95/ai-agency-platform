import { useNavigate } from 'react-router-dom';
import { SegmentBadge, StatusBadge, TopicBadge } from './Badge';
import Stars from './Stars';
import { formatDate, getVisibleTopics, truncateText } from '../lib/utils';

export default function ReviewRow({ review, compact = false }) {
  const navigate = useNavigate();
  const { visible, hiddenCount } = getVisibleTopics(review.topic || [], compact ? 2 : 3);

  return (
    <article className="rounded-[16px] border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-ink sm:text-lg">{review.autore}</h4>
            <p className="mt-1 text-sm text-neutral-400">
              {review.reference_id || 'email non disponibile'}
            </p>
            <p className="mt-1 text-xs font-medium text-neutral-500">{formatDate(review.data)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Stars value={review.stelle} />
            <StatusBadge status={review.stato} />
          </div>
        </div>

        <p className="text-sm leading-6 text-neutral-600">
          {truncateText(review.testo, compact ? 100 : 180)}
        </p>

        <div className="flex flex-wrap gap-2">
          <SegmentBadge segment={review.segmento} />
          {visible.length ? (
            <>
              {visible.map((topic, index) => (
                <TopicBadge key={`${review.id}-${topic}`} topic={topic} index={index} />
              ))}
              {hiddenCount ? (
                <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600 ring-1 ring-inset ring-neutral-200">
                  +{hiddenCount} altri
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-sm text-neutral-400">Topic non disponibili</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
            Recensione cliente
          </span>
          <button
            type="button"
            onClick={() => navigate(`/reviews/${review.id}`)}
            className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
          >
            Vedi dettaglio
          </button>
        </div>
      </div>
    </article>
  );
}
