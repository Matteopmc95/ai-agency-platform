export default function LoadingState({ label = 'Caricamento in corso...' }) {
  return (
    <div className="rounded-[16px] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="animate-pulse space-y-4">
        <div>
          <div className="h-3 w-24 rounded-full bg-neutral-200" />
          <p className="mt-3 text-sm text-neutral-500">{label}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 rounded-[14px] bg-neutral-100" />
          <div className="h-24 rounded-[14px] bg-neutral-100" />
        </div>
        <div className="h-40 rounded-[14px] bg-neutral-100" />
      </div>
    </div>
  );
}
