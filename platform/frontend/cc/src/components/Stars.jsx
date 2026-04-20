export default function Stars({ value }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${value} stelle`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={index < value ? 'text-amber-400' : 'text-slate-200'}>
          ★
        </span>
      ))}
    </div>
  );
}
