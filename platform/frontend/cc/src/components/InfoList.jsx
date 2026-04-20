export default function InfoList({ items }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between gap-4 rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3"
        >
          <span className="text-sm text-neutral-500">{item.label}</span>
          <span className="text-sm font-semibold text-ink">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
