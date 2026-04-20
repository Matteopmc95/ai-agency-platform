import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ErrorState from '../components/ErrorState';
import InfoList from '../components/InfoList';
import LoadingState from '../components/LoadingState';
import SectionCard from '../components/SectionCard';
import Stars from '../components/Stars';
import { FlagBadge, StatusBadge, TopicBadge } from '../components/Badge';
import {
  approveReview,
  fetchReview,
  getErrorMessage,
  regenerateReview,
} from '../lib/api';
import { formatDate } from '../lib/utils';
import { useIsAdmin } from '../lib/auth';

export default function ReviewDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canViewLogs = useIsAdmin();
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responseText, setResponseText] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  async function loadReview() {
    try {
      setLoading(true);
      setError('');
      const data = await fetchReview(id);
      setReview(data);
      setResponseText(data.risposta_generata || '');
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Impossibile caricare il dettaglio recensione.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReview();
  }, [id]);

  async function handleApprove() {
    try {
      setApproveLoading(true);
      setActionError('');
      setActionMessage('');
      const result = await approveReview(id, responseText);
      setActionMessage('Risposta approvata e pubblicata correttamente.');
      setResponseText(result.risposta_pubblicata);
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
      setActionError(getErrorMessage(approveError, 'Pubblicazione non riuscita.'));
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
            }
          : current
      );
      setResponseText(result.analisi?.risposta_generata || '');
      setActionMessage('Risposta AI rigenerata con successo.');
    } catch (regenerateError) {
      setActionError(getErrorMessage(regenerateError, 'Rigenerazione non riuscita.'));
    } finally {
      setRegenerateLoading(false);
    }
  }

  if (loading) {
    return <LoadingState label="Caricamento dettaglio recensione..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadReview} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/dashboard"
          className="w-fit rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Torna alla dashboard
        </Link>
        {canViewLogs ? (
          <button
            type="button"
            onClick={() => navigate('/logs')}
            className="w-fit rounded-full bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
          >
            Vai ai log agenti
          </button>
        ) : null}
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <SectionCard
            eyebrow="Recensione"
            title={review.autore}
            description={`Ricevuta il ${formatDate(review.data)}.`}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-neutral-500">Recensione #{review.id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Stars value={review.stelle} />
                <StatusBadge status={review.stato} />
              </div>
            </div>

            <div className="mt-6 rounded-[20px] border border-neutral-200 bg-neutral-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
                Testo originale
              </p>
              <p className="mt-3 text-sm leading-7 text-neutral-700">{review.testo}</p>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
                Topic identificati
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {review.topic?.length ? (
                  review.topic.map((topic, index) => (
                    <TopicBadge key={topic} topic={topic} index={index} />
                  ))
                ) : (
                  <span className="text-sm text-neutral-500">Nessun topic disponibile.</span>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Composer"
            title="Risposta generata dall'AI"
            description="Modifica il testo, rigenera la proposta o pubblica direttamente su Trustpilot."
          >
            <textarea
              value={responseText}
              onChange={(event) => setResponseText(event.target.value)}
              rows={12}
              className="w-full rounded-[20px] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-700 outline-none transition focus:border-brand-400 focus:bg-white"
              placeholder="La risposta AI comparirà qui."
            />

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

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleApprove}
                disabled={
                  approveLoading ||
                  regenerateLoading ||
                  !responseText.trim() ||
                  review.stato === 'published'
                }
                className="rounded-[16px] bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approveLoading
                  ? 'Pubblicazione...'
                  : review.stato === 'published'
                    ? 'Già pubblicata'
                    : 'Approva e Pubblica'}
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={approveLoading || regenerateLoading}
                className="rounded-[16px] border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {regenerateLoading ? 'Rigenerazione...' : 'Rigenera Risposta'}
              </button>
            </div>
          </SectionCard>
        </div>

        <aside className="space-y-6">
          <SectionCard eyebrow="BO" title="Dati operativi">
            <InfoList
              items={[
                { label: 'Segmento', value: review.segmento || 'n.d.' },
                { label: 'Prima prenotazione', value: review.prima_prenotazione ? 'Sì' : 'No' },
                { label: 'Cross', value: review.cross ? 'Sì' : 'No' },
                { label: 'Località', value: review.localita || 'n.d.' },
              ]}
            />
          </SectionCard>

          <SectionCard
            eyebrow="Flag"
            title="Segnali da monitorare"
            description="Indicatori utili per prioritizzare la risposta e il tono del messaggio."
          >
            <div className="mt-4 flex flex-wrap gap-3">
              <FlagBadge active={review.flag_referral}>Referral</FlagBadge>
              <FlagBadge active={review.flag_cross}>Cross-selling</FlagBadge>
            </div>
          </SectionCard>
        </aside>
      </section>
    </div>
  );
}
