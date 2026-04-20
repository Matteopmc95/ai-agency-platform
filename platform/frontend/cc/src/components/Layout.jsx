import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUserProfile } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { classNames } from '../lib/utils';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/reviews', label: 'Recensioni' },
  { to: '/analytics', label: 'Analytics' },
];

function NavigationContent({ onNavigate }) {
  return (
    <nav className="space-y-2">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            classNames(
              'flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition',
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-neutral-600 hover:bg-brand-50 hover:text-brand-700'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserCard({ name, email, onLogout }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-sm font-semibold text-ink">{name}</p>
      <p className="mt-1 break-all text-sm text-neutral-500">{email}</p>
      <button
        type="button"
        onClick={onLogout}
        className="mt-4 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
      >
        Esci
      </button>
    </div>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { name, email } = useUserProfile();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  async function logout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] lg:p-4">
        <div
          className={classNames(
            'fixed inset-0 z-40 bg-neutral-950/35 transition lg:hidden',
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
        />

        <aside
          className={classNames(
            'fixed inset-y-0 left-0 z-50 flex w-[84%] max-w-[320px] flex-col border-r border-neutral-200 bg-white p-5 shadow-xl transition-transform duration-300 lg:static lg:w-[280px] lg:max-w-none lg:translate-x-0 lg:rounded-[24px] lg:border lg:shadow-sm',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex items-center justify-between lg:block">
            <div>
              <p className="text-[24px] font-bold tracking-[-0.03em] text-brand-600">ParkingMyCar</p>
              <p className="mt-1 text-sm text-neutral-500">Customer Care</p>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-full border border-neutral-200 p-2 text-neutral-500 lg:hidden"
              aria-label="Chiudi menu"
            >
              <span className="block h-4 w-4">×</span>
            </button>
          </div>

          <div className="mt-8 flex-1">
            <NavigationContent onNavigate={() => setMobileOpen(false)} />
          </div>

          <UserCard name={name} email={email} onLogout={logout} />
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-neutral-200 bg-[#f8f7f4]/95 px-4 py-4 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white shadow-sm"
                aria-label="Apri menu"
              >
                <span className="flex flex-col gap-1.5">
                  <span className="block h-0.5 w-5 rounded-full bg-neutral-700" />
                  <span className="block h-0.5 w-5 rounded-full bg-neutral-700" />
                  <span className="block h-0.5 w-5 rounded-full bg-neutral-700" />
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-ink">{name}</p>
                <p className="truncate text-sm text-neutral-500">{email}</p>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-4 lg:px-6 lg:py-6">
            <div className="mx-auto w-full max-w-[1200px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
