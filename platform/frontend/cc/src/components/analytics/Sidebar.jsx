const NAV_ITEMS = [
  {
    id: 's1', label: 'Overview',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path d="M2 3.75A.75.75 0 012.75 3h3.5a.75.75 0 010 1.5h-3.5A.75.75 0 012 3.75zm0 5A.75.75 0 012.75 8h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 012 8.75zm0 5a.75.75 0 01.75-.75h5.5a.75.75 0 010 1.5h-5.5a.75.75 0 01-.75-.75zM13.5 4.5a1 1 0 100 2 1 1 0 000-2zm-3.25 1a3.25 3.25 0 116.5 0 3.25 3.25 0 01-6.5 0zm3.25 5.5a1 1 0 100 2 1 1 0 000-2zM10.25 10a3.25 3.25 0 116.5 0 3.25 3.25 0 01-6.5 0zm3.25 5.5a1 1 0 100 2 1 1 0 000-2zm-3.25 1a3.25 3.25 0 116.5 0 3.25 3.25 0 01-6.5 0z" />
      </svg>
    ),
  },
  {
    id: 's2', label: 'Segmenti & Location',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.757.433 5.741 5.741 0 00.279.14l.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 's3', label: 'Topic Analysis',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 's4', label: 'Customer Journey',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
      </svg>
    ),
  },
  {
    id: 's5', label: 'Tempistiche',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 's6', label: 'AI & Risposte',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.784l-1.192.24a1 1 0 000 1.96l1.192.24a1 1 0 01.784.784l.24 1.192a1 1 0 001.96 0l.24-1.192a1 1 0 01.784-.784l1.192-.24a1 1 0 000-1.96l-1.192-.24a1 1 0 01-.784-.784l-.24-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684z" />
      </svg>
    ),
  },
];

export default function Sidebar({ activeSection, onNavigate }) {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
          Sezioni
        </p>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={[
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-ink',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={isActive ? 'text-brand-600' : 'text-neutral-400'}>
                  {icon}
                </span>
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* PDF export — bottom */}
      <div className="shrink-0 border-t border-neutral-200 px-3 py-4">
        <button
          type="button"
          onClick={() => onNavigate('pdf')}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-neutral-400">
            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
          </svg>
          <span>Esporta PDF</span>
        </button>
      </div>
    </aside>
  );
}
