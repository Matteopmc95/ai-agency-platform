export default function LoadingState({ label = 'Caricamento in corso...' }) {
  return (
    <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-500">Loading</p>
        <p className="mt-1 text-sm text-neutral-600">{label}</p>
        </div>
      </div>
    </div>
  );
}
