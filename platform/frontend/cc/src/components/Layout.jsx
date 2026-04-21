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

function NavItems({ onNavigate, mobile = false }) {
  return (
    <nav className={classNames('flex items-center', mobile ? 'flex-col items-stretch gap-2' : 'gap-2')}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            classNames(
              'rounded-full px-4 py-2 text-sm font-semibold transition',
              mobile ? 'text-left' : '',
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-ink'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
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
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 lg:px-8">
          <div className="flex shrink-0 items-center">
            <img
              src="/logo-pmc.png"
              alt="ParkingMyCar"
              className="h-8 object-contain"
            />
          </div>

          <div className="hidden flex-1 justify-center lg:flex">
            <NavItems />
          </div>

          <div className="hidden items-center gap-4 lg:flex">
            <div className="text-right">
              <p className="text-sm font-semibold text-ink">{name}</p>
              <p className="text-xs text-neutral-500">{email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              Esci
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white lg:hidden"
            aria-label="Apri menu"
          >
            <span className="flex flex-col gap-1.5">
              <span className="block h-0.5 w-5 rounded-full bg-neutral-700" />
              <span className="block h-0.5 w-5 rounded-full bg-neutral-700" />
              <span className="block h-0.5 w-5 rounded-full bg-neutral-700" />
            </span>
          </button>
        </div>

        <div
          className={classNames(
            'overflow-hidden border-t border-neutral-200 bg-white transition-all duration-300 lg:hidden',
            mobileOpen ? 'max-h-[320px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="space-y-4 px-4 py-4">
            <NavItems mobile onNavigate={() => setMobileOpen(false)} />

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-ink">{name}</p>
              <p className="mt-1 break-all text-sm text-neutral-500">{email}</p>
              <button
                type="button"
                onClick={logout}
                className="mt-4 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                Esci
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 lg:px-8 lg:py-6">
        <div className="w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
