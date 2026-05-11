import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SegmentBadge, SourceBadge, StatusBadge, TopicBadge } from './Badge';
import Stars from './Stars';
import { approveReview, getErrorMessage, regenerateReview } from '../lib/api';
import { formatDate, getVisibleTopics, truncateText } from '../lib/utils';

export default function ReviewRow({ review: initialReview, compact = false, onUpdate }) {
  const navigate = useNavigate();
  const textareaRef = useRef(null);

  const [review, setReview] = useState(initialReview);
  const { visible, hiddenCount } = getVisibleTopics(review.topic || [], compact ? 2 : 3);

  const [responseText, setResponseText] = useState(review.risposta_generata || '');
  const [draftResponseText, setDraftResponseText] = useState(review.risposta_generata || '');
  const [isEditing, setIsEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const isApple = review.source === 'apple' || review.source === 'apple_store';
  const hasResponse = Boolean(responseText.trim());
  const canPublish = hasResponse && responseText.trim().length >= 10 && review.stato !== 'published';
  const isLoading = approveLoading || regenerateLoading;

  function applyUpdate(updates) {
    const next = { ...review, ...updates };
    setReview(next);
    onUpdate?.(review.id, updates);
  }

  async function handleApprove() {
    try {
      setApproveLoading(true);
      setActionError('');
      const result = await approveReview(review.id, responseText);
      const pub = result.risposta_pubblicata;
      setResponseText(pub);
      setDraftResponseText(pub);
      setIsEditing(false);
      applyUpdate({ stato: 'published', risposta_generata: pub });
    } catch (err) {
      setActionError(getErrorMessage(err, 'Impossibile pubblicare la risposta, riprova.'));
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleRegenerate() {
    try {
      setRegenerateLoading(true);
      setActionError('');
      const result = await regenerateReview(review.id);
      const generated = result.analisi?.risposta_generata || '';
      setResponseText(generated);
      setDraftResponseText(generated);
      setIsEditing(false);
      applyUpdate({
        ...result.analisi,
        topic: result.analisi?.topic || [],
        risposta_generata: generated,
      });
    } catch (err) {
      setActionError(getErrorMessage(err, 'Impossibile rigenerare la risposta, riprova.'));
    } finally {
      setRegenerateLoading(false);
    }
  }

  function handleEdit() {
    setDraftResponseText(responseText);
    setIsEditing(true);
    setActionError('');
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange?.(draftResponseText.length, draftResponseText.length);
    });
  }

  function handleSaveEdit() {
    setResponseText(draftResponseText);
    setIsEditing(false);
    setActionError('');
  }

  function handleCancelEdit() {
    setDraftResponseText(responseText);
    setIsEditing(false);
    setActionError('');
  }

  return (
    <article className="rounded-[16px] border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md">
      <div className="flex flex-col gap-4">

        {/* Header: autore, date, stelle, badge */}
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
            <SourceBadge source={review.source} />
            <StatusBadge status={review.stato} />
            {isApple && (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-500 ring-1 ring-inset ring-neutral-200">
                Solo monitoraggio
              </span>
            )}
          </div>
        </div>

        {/* Testo recensione */}
        <p className="text-sm leading-6 text-neutral-600">
          {truncateText(review.testo, compact ? 100 : 180)}
        </p>

        {/* Badge segmento + topic */}
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

        {/* Risposta AI + bottoni — nascosti per Apple (l'API non supporta reply) */}
        {!isApple && (
          <>
            <div className="rounded-[12px] border border-neutral-100 bg-neutral-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
                Risposta AI
              </p>

              {isEditing ? (
                <textarea
                  ref={textareaRef}
                  value={draftResponseText}
                  onChange={(e) => setDraftResponseText(e.target.value)}
                  rows={5}
                  className="w-full rounded-[10px] border border-neutral-200 bg-white px-3 py-2 text-sm leading-6 text-neutral-700 outline-none transition focus:border-brand-400 focus:bg-white"
                />
              ) : hasResponse ? (
                <div>
                  <p className={`text-sm leading-6 text-neutral-700 ${expanded ? '' : 'line-clamp-3'}`}>
                    {responseText}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    {expanded ? 'Comprimi' : 'Espandi'}
                  </button>
                </div>
              ) : (
                <p className="text-sm italic text-neutral-400">Risposta non ancora generata</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={!draftResponseText.trim()}
                    className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Salva modifiche
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200"
                  >
                    Annulla
                  </button>
                </>
              ) : (
                <>
                  {hasResponse && (
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={isLoading || !canPublish}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {approveLoading ? 'Pubblicazione…' : 'Pubblica risposta'}
                    </button>
                  )}
                  {hasResponse && (
                    <button
                      type="button"
                      onClick={handleEdit}
                      disabled={isLoading}
                      className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Modifica risposta
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={isLoading}
                    className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {regenerateLoading ? 'Rigenerazione…' : 'Rigenera con AI'}
                  </button>
                </>
              )}
            </div>

            {actionError && (
              <p className="text-xs font-medium text-red-600">{actionError}</p>
            )}
          </>
        )}

        {/* Footer: label + Vedi dettaglio */}
        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
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
