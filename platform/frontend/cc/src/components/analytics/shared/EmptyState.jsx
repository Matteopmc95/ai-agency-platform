export default function EmptyState({ message, onRetry, isError = false }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white px-8 py-20 text-center">
      <div className={[
        'flex h-12 w-12 items-center justify-center rounded-full',
        isError ? 'bg-red-50' : 'bg-neutral-100',
      ].join(' ')}>
        {isError ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-red-500">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-neutral-400">
            <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 14.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13zm-.75-4.75a.75.75 0 001.5 0V9a.75.75 0 00-1.5 0v2.75zm.75-5a.875.875 0 100 1.75.875.875 0 000-1.75z" />
          </svg>
        )}
      </div>
      <p className="mt-4 text-sm font-medium text-neutral-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
        >
          Riprova
        </button>
      )}
    </div>
  );
}
