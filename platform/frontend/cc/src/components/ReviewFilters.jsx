export default function ReviewFilters({ filters, onChange, onReset }) {
  return (
    <div className="rounded-[24px] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">Filtri</p>
          <h3 className="mt-2 text-[28px] font-semibold text-ink">Recensioni</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Affina la vista per stato e numero di stelle.
          </p>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
        >
          Reset filtri
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="space-y-2 text-sm font-medium text-neutral-700">
          <span>Stato</span>
          <select
            value={filters.status}
            onChange={(event) => onChange('status', event.target.value)}
            className="w-full rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-brand-400 focus:bg-white"
          >
            <option value="">Tutti</option>
            <option value="pending">In attesa</option>
            <option value="approved">Approvata</option>
            <option value="published">Pubblicata</option>
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium text-neutral-700">
          <span>Stelle minime</span>
          <select
            value={filters.minStars}
            onChange={(event) => onChange('minStars', event.target.value)}
            className="w-full rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-brand-400 focus:bg-white"
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}+
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium text-neutral-700">
          <span>Stelle massime</span>
          <select
            value={filters.maxStars}
            onChange={(event) => onChange('maxStars', event.target.value)}
            className="w-full rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-brand-400 focus:bg-white"
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
