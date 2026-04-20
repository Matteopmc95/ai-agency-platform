export default function StatCard({ label, value, accent, helper }) {
  return (
    <div className="rounded-[24px] border border-neutral-200 bg-white px-5 py-5 shadow-sm">
      <div
        className="mb-5 h-2 w-16 rounded-full"
        style={{
          background: accent,
        }}
      />
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-ink">{value}</p>
      {helper ? <p className="mt-2 text-sm text-neutral-500">{helper}</p> : null}
    </div>
  );
}
