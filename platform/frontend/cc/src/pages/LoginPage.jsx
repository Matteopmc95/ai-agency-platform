import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6.5h16v11H4z" />
      <path d="m5 8 7 5 7-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3 21 21" />
      <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a17.6 17.6 0 0 1-4 4.6" />
      <path d="M6.7 6.8C4 8.5 2 12 2 12a17.8 17.8 0 0 0 10 6c1.6 0 3-.3 4.2-.8" />
      <path d="M9.9 9.9A3 3 0 0 0 14 14" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const emailRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (loginError) {
      setError('Email o password non corretti. Riprova.');
      return;
    }

    navigate('/dashboard');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F9FA] px-6 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src="/logo-pmc.png"
          alt=""
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-24 w-auto -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.05] sm:h-32"
        />
      </div>

      <div className="login-card-enter relative z-10 w-full max-w-[400px] rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="text-center">
          <img
            src="/logo-pmc.png"
            alt="ParkingMyCar"
            className="mx-auto h-10 object-contain"
          />
          <p className="mt-2 text-sm font-medium text-neutral-400">Customer Care Dashboard</p>
        </div>

        <div className="mt-10">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink">Accedi al tuo account</h1>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-neutral-700">Email</span>
            <div className="flex items-center rounded-lg border border-neutral-200 bg-white px-3 transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <span className="text-neutral-400">
                <MailIcon />
              </span>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border-0 bg-transparent px-3 py-3.5 text-neutral-800 outline-none"
                placeholder="La tua email aziendale"
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-neutral-700">Password</span>
            <div className="flex items-center rounded-lg border border-neutral-200 bg-white px-3 transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <span className="text-neutral-400">
                <LockIcon />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border-0 bg-transparent px-3 py-3.5 text-neutral-800 outline-none"
                placeholder="La tua password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="text-neutral-400 transition hover:text-neutral-600"
                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-brand-500 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Accesso in corso...
              </>
            ) : (
              'Accedi'
            )}
          </button>

          {error ? (
            <p className="flex items-center gap-2 text-sm font-medium text-red-600">
              <span aria-hidden="true">⚠️</span>
              {error}
            </p>
          ) : null}
        </form>

        <p className="mt-8 text-center text-xs leading-6 text-neutral-400">
          Accesso riservato al team ParkingMyCar
        </p>
      </div>
    </div>
  );
}
