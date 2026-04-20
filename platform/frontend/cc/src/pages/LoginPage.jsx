import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError('Credenziali non valide. Verifica email e password.');
      return;
    }

    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-sand p-3 sm:p-4">
      <div className="subtle-grid flex min-h-[calc(100vh-1.5rem)] items-center rounded-[28px] border border-neutral-200 bg-[#FCFCFC] p-4 sm:p-6">
        <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="page-surface overflow-hidden p-8 sm:p-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-600">
              AI Agency Platform - CC
            </p>
            <h1 className="mt-4 text-5xl font-semibold leading-tight text-ink">
              Gestisci le recensioni Trustpilot con una vista chiara e operativa.
            </h1>
            <p className="mt-5 text-lg leading-8 text-neutral-600">
              Dashboard dedicata al team Customer Care per revisionare risposte AI, pubblicarle
              rapidamente e monitorare gli agenti in un unico flusso.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              'Statistiche aggregate aggiornate',
              'Workflow di approvazione e pubblicazione',
              'Storico log agenti per admin',
            ].map((item) => (
              <div key={item} className="rounded-[20px] border border-brand-100 bg-brand-50 p-4 text-sm font-medium text-brand-900">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="page-surface p-8 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-600">
            Accesso operatore
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-ink">Login</h2>
          <p className="mt-3 text-sm text-neutral-600">
            Accedi con le credenziali del tuo account operatore.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-neutral-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-800 outline-none transition focus:border-brand-400 focus:bg-white"
                placeholder="nome@azienda.it"
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-neutral-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-800 outline-none transition focus:border-brand-400 focus:bg-white"
                placeholder="Inserisci password"
                required
              />
            </label>

            {error && (
              <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[16px] bg-ink px-6 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? 'Accesso in corso…' : 'Entra nella dashboard'}
            </button>
          </form>
        </section>
        </div>
      </div>
    </div>
  );
}
