export default function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-[16px] border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-600">
          Attenzione
        </p>
        <h3 className="mt-2 text-lg font-semibold text-ink">Impossibile caricare i dati</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {message || 'Riprova tra qualche istante.'}
        </p>
      </div>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-fit rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Riprova
        </button>
      ) : null}
    </div>
  );
}
