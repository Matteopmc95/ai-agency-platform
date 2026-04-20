export default function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-[24px] border border-red-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-500">
          Errore
        </p>
        <h3 className="mt-2 text-lg font-semibold text-ink">Impossibile completare la richiesta</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{message}</p>
      </div>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="w-fit rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Riprova
        </button>
      ) : null}
    </div>
  );
}
