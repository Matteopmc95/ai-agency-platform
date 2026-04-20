import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/logs', label: 'Log agenti' },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = location.pathname.startsWith('/reviews/')
    ? 'Dettaglio recensione'
    : location.pathname === '/logs'
      ? 'Log agenti'
      : 'Cruscotto recensioni';
  const pageDescription = location.pathname.startsWith('/reviews/')
    ? 'Controlla i dettagli operativi, modifica la risposta AI e pubblica su Trustpilot.'
    : location.pathname === '/logs'
      ? 'Monitora gli eventi degli agenti e verifica errori, rigenerazioni e pubblicazioni.'
      : 'Vista completa per priorita, performance, filtri e coda di lavorazione.';

  function logout() {
    localStorage.removeItem('cc-auth');
    localStorage.removeItem('cc-auth-email');
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-sand p-3 sm:p-4">
      <div className="subtle-grid flex min-h-[calc(100vh-1.5rem)] flex-col gap-4 rounded-[28px] border border-neutral-200 bg-[#FCFCFC] p-3 sm:p-4 lg:flex-row">
        <aside className="page-surface flex w-full flex-col justify-between overflow-hidden p-6 lg:w-[280px] lg:shrink-0">
          <div>
            <div className="rounded-[24px] bg-ink p-6 text-white">
              <p className="text-xs uppercase tracking-[0.28em] text-white/50">AI Agency Platform</p>
              <h1 className="mt-3 text-[28px] font-semibold leading-8">CC Dashboard</h1>
              <p className="mt-3 text-sm leading-6 text-white/70">
                Monitoraggio recensioni, risposte AI e pubblicazione Trustpilot.
              </p>
            </div>

            <nav className="mt-6 flex flex-col gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'rounded-[16px] border px-4 py-3 text-sm font-semibold transition',
                      isActive
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-transparent text-neutral-600 hover:border-brand-100 hover:bg-brand-50 hover:text-brand-700',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="mt-6 rounded-[20px] border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">
            <p className="font-semibold">Operatore collegato</p>
            <p className="mt-1 text-brand-950">
              {localStorage.getItem('cc-auth-email') || 'cc@azienda.it'}
            </p>
            <button
              type="button"
              onClick={logout}
              className="mt-4 rounded-full border border-brand-200 bg-white px-4 py-2 font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-100"
            >
              Esci
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="page-surface flex min-h-full flex-col overflow-hidden">
            <header className="flex flex-col gap-6 border-b border-neutral-200 px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">
                    Area operativa
                  </p>
                  <h2 className="mt-3 text-[40px] font-semibold leading-[1.05] text-ink">
                    {pageTitle}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-500">
                    {pageDescription}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                    Base API:{' '}
                    <span className="font-semibold text-ink">
                      {import.meta.env.VITE_API_BASE_URL || '/api'}
                    </span>
                  </div>

                  <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
                    Modalita: <span className="font-semibold text-ink">Customer Care</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Priorita</p>
                  <p className="mt-2 text-sm font-semibold text-ink">Recensioni in coda e pubblicazioni</p>
                </div>
                <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Obiettivo</p>
                  <p className="mt-2 text-sm font-semibold text-ink">Ridurre i tempi di review e approvazione</p>
                </div>
                <div className="rounded-[18px] border border-brand-100 bg-brand-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-500">Focus</p>
                  <p className="mt-2 text-sm font-semibold text-brand-900">Esperienza full-page, leggibile e rapida</p>
                </div>
              </div>
            </header>

            <div className="flex-1 px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
