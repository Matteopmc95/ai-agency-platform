import { useNavigate } from 'react-router-dom';
import { FlagBadge, StatusBadge, TopicBadge } from './Badge';
import Stars from './Stars';
import { formatDate } from '../lib/utils';

export default function ReviewRow({ review }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/reviews/${review.id}`)}
      className="w-full rounded-[24px] border border-neutral-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h4 className="text-lg font-bold text-ink">{review.autore}</h4>
              <p className="mt-1 text-sm text-neutral-500">{formatDate(review.data)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Stars value={review.stelle} />
              <StatusBadge status={review.stato} />
            </div>
          </div>

          <p className="mt-4 line-clamp-3 text-sm leading-7 text-neutral-600">{review.testo}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {review.topic?.length ? (
              review.topic.map((topic, index) => (
                <TopicBadge key={topic} topic={topic} index={index} />
              ))
            ) : (
              <span className="text-sm text-neutral-400">Topic non ancora disponibili</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-xs lg:justify-end">
          <FlagBadge active={review.flag_referral}>Referral</FlagBadge>
          <FlagBadge active={review.flag_cross}>Cross-selling</FlagBadge>
          <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
            Segmento: {review.segmento || 'n.d.'}
          </span>
        </div>
      </div>
    </button>
  );
}
