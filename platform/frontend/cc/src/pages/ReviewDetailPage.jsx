import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FlagBadge, SegmentBadge, SourceBadge, StatusBadge, TopicBadge } from '../components/Badge';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import Stars from '../components/Stars';
import {
  approveReview,
  fetchReview,
  getErrorMessage,
  regenerateReview,
} from '../lib/api';
import { formatDate } from '../lib/utils';

function InfoCard({ label, value, icon, subtle = false }) {
  return (
    <div className="rounded-[16px] border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600">
          {icon}
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">{label}</p>
          <p className={`mt-1 text-sm font-semibold ${subtle ? 'text-neutral-500' : 'text-ink'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function formatBookingDate(value) {
  if (!value) return 'Non disponibile';

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

function getBookingStatus(value) {
  if (!value) return 'Non disponibile';

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const bookingDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(bookingDate.getTime())) return 'Non disponibile';
  if (bookingDate > todayDate) return '🔵 Prenotazione futura';
  if (bookingDate < todayDate) return '⚪ Prenotazione passata';
  return '🟢 Prenotazione in corso';
}

function getBookingSummary(value) {
  if (!value) return 'Non disponibile';
  return `${formatBookingDate(value)} · ${getBookingStatus(value)}`;
}

export default function ReviewDetailPage() {
  const { id } = useParams();
  const textareaRef = useRef(null);
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responseText, setResponseText] = useState('');
  const [draftResponseText, setDraftResponseText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const hasGeneratedResponse = Boolean(review?.risposta_generata);
  const canPublish = responseText.trim().length >= 10;

  useEffect(() => {
    async function loadReview() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchReview(id);
        setReview(data);
        setResponseText(data.risposta_generata || '');
        setDraftResponseText(data.risposta_generata || '');
        setIsEditing(false);
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Impossibile caricare i dati, riprova.'));
      } finally {
        setLoading(false);
      }
    }

    loadReview();
  }, [id]);

  async function handleApprove() {
    try {
      setApproveLoading(true);
      setActionError('');
      setActionMessage('');
      const result = await approveReview(id, responseText);
      setActionMessage('Risposta pubblicata correttamente.');
      setResponseText(result.risposta_pubblicata);
      setDraftResponseText(result.risposta_pubblicata);
      setIsEditing(false);
      setReview((current) =>
        current
          ? {
              ...current,
              stato: 'published',
              risposta_generata: result.risposta_pubblicata,
            }
          : current
      );
    } catch (approveError) {
      setActionError(getErrorMessage(approveError, 'Impossibile pubblicare la risposta, riprova.'));
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleRegenerate() {
    try {
      setRegenerateLoading(true);
      setActionError('');
      setActionMessage('');
      const result = await regenerateReview(id);
      setReview((current) =>
        current
          ? {
              ...current,
              ...result.analisi,
              topic: result.analisi.topic || [],
              risposta_generata: result.analisi?.risposta_generata || '',
            }
          : current
      );
      setResponseText(result.analisi?.risposta_generata || '');
      setDraftResponseText(result.analisi?.risposta_generata || '');
      setIsEditing(false);
      setActionMessage('La risposta è stata rigenerata con successo.');
    } catch (regenerateError) {
      setActionError(getErrorMessage(regenerateError, 'Impossibile rigenerare la risposta, riprova.'));
    } finally {
      setRegenerateLoading(false);
    }
  }

  function handleEdit() {
    setDraftResponseText(responseText);
    setIsEditing(true);
    setActionError('');
    setActionMessage('');
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange?.(draftResponseText.length, draftResponseText.length);
    });
  }

  function handleSaveEdit() {
    setResponseText(draftResponseText);
    setIsEditing(false);
    setActionError('');
    setActionMessage('Modifiche salvate. La risposta aggiornata verrà usata in pubblicazione.');
  }

  function handleCancelEdit() {
    setDraftResponseText(responseText);
    setIsEditing(false);
    setActionError('');
  }

  if (loading) {
    return <LoadingState label="Sto preparando il dettaglio recensione..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-600">Recensione</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">{review.autore}</h1>
          <p className="mt-2 text-sm text-neutral-500">
            {review.reference_id || 'email non disponibile'} · {formatDate(review.data)}
          </p>
        </div>

        <Link
          to="/reviews"
          className="w-fit rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
        >
          Torna alle recensioni
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
        <section className="space-y-5">
          <div className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Stars value={review.stelle} />
              <SourceBadge source={review.source} />
              <StatusBadge status={review.stato} />
              <SegmentBadge segment={review.segmento} />
            </div>

            <div className="mt-5 rounded-[16px] bg-neutral-50 p-5">
              <p className="text-sm leading-7 text-neutral-700">{review.testo}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {review.topic?.length ? (
                review.topic.map((topic, index) => (
                  <TopicBadge key={`${review.id}-${topic}`} topic={topic} index={index} />
                ))
              ) : (
                <span className="text-sm text-neutral-400">Topic non disponibili</span>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard label="Segmento" value={review.segmento || 'Non disponibile'} icon="S" />
            <InfoCard
              label="Email utente"
              value={review.reference_id || 'Non disponibile'}
              icon="@"
              subtle={!review.reference_id}
            />
            <InfoCard
              label="Località"
              value={review.localita || 'Non disponibile'}
              icon="L"
              subtle={!review.localita}
            />
            <InfoCard
              label="ID prenotazione"
              value="Non disponibile"
              icon="#"
              subtle
            />
            <InfoCard
              label="Data prenotazione"
              value={getBookingSummary(review.booking_date)}
              icon="D"
              subtle={!review.booking_date}
            />
            <div className="rounded-[16px] border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Prima prenotazione
              </p>
              <div className="mt-3">
                <FlagBadge active={review.prima_prenotazione}>Cliente nuovo</FlagBadge>
              </div>
            </div>
            <div className="rounded-[16px] border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Cross-selling
              </p>
              <div className="mt-3">
                <FlagBadge active={review.cross}>Cross-selling</FlagBadge>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-600">Risposta</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">
            Risposta da inviare al cliente
          </h2>

          <div className="mt-5">
            {hasGeneratedResponse ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-neutral-500">
                    {isEditing
                      ? 'Modalità modifica attiva'
                      : 'Messaggio bloccato. Premi "Modifica risposta" per cambiarlo.'}
                  </p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isEditing
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {isEditing ? 'Modificabile' : 'Solo lettura'}
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={isEditing ? draftResponseText : responseText}
                  onChange={(event) => setDraftResponseText(event.target.value)}
                  readOnly={!isEditing}
                  rows={14}
                  className={`w-full rounded-[16px] border px-4 py-4 text-sm leading-7 text-neutral-700 outline-none transition ${
                    isEditing
                      ? 'border-brand-300 bg-white focus:border-brand-400'
                      : 'border-neutral-200 bg-neutral-50'
                  }`}
                />
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-neutral-500">
                    La risposta AI non è ancora disponibile. Puoi scrivere manualmente il messaggio.
                  </p>
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                    Modifica manuale
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                  rows={14}
                  className="w-full rounded-[16px] border border-brand-300 bg-white px-4 py-4 text-sm leading-7 text-neutral-700 outline-none transition focus:border-brand-400"
                  placeholder="Scrivi qui la risposta da inviare al cliente..."
                />
              </>
            )}
          </div>

          {actionMessage ? (
            <div className="mt-4 rounded-[16px] bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {actionMessage}
            </div>
          ) : null}

          {actionError ? (
            <div className="mt-4 rounded-[16px] bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={handleApprove}
              disabled={approveLoading || regenerateLoading || isEditing || !canPublish || review.stato === 'published'}
              className="rounded-[16px] bg-emerald-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approveLoading ? 'Pubblicazione...' : 'Pubblica risposta'}
            </button>

            {hasGeneratedResponse ? (
              isEditing ? (
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={!draftResponseText.trim()}
                  className="rounded-[16px] border border-neutral-200 bg-white px-5 py-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Salva modifiche
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={!responseText}
                  className="rounded-[16px] border border-neutral-200 bg-white px-5 py-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Modifica risposta
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => textareaRef.current?.focus()}
                className="rounded-[16px] border border-neutral-200 bg-white px-5 py-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
              >
                Scrivi risposta
              </button>
            )}

            {hasGeneratedResponse && isEditing ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-[16px] bg-neutral-100 px-5 py-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200"
              >
                Annulla
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={approveLoading || regenerateLoading}
                className="rounded-[16px] bg-brand-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {regenerateLoading ? 'Rigenerazione...' : 'Rigenera con AI'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
