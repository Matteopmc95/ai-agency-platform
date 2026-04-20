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

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (loginError) {
      setError('Non riusciamo ad accedere con queste credenziali. Riprova.');
      return;
    }

    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[24px] border border-neutral-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-[28px] font-bold tracking-[-0.03em] text-brand-600">ParkingMyCar</p>
          <p className="mt-2 text-sm font-medium uppercase tracking-[0.18em] text-neutral-400">
            Customer Care
          </p>

          <h1 className="mt-8 text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">
            Una dashboard pensata per gestire le recensioni con chiarezza.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-neutral-600">
            Controlla le recensioni in arrivo, rivedi le risposte suggerite e pubblica più velocemente ogni giorno.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              'Vista mobile-first',
              'Code di lavoro sempre chiare',
              'Analytics facili da leggere',
            ].map((item) => (
              <div key={item} className="rounded-[16px] border border-brand-100 bg-brand-50 p-4 text-sm font-medium text-brand-900">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-neutral-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-600">
            Accesso operatore
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">Bentornato</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            Inserisci le tue credenziali per entrare nella dashboard.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-neutral-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-800 outline-none transition focus:border-brand-400 focus:bg-white"
                placeholder="nome@parkingmycar.it"
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

            {error ? (
              <p className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[16px] bg-brand-600 px-6 py-4 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? 'Accesso in corso...' : 'Entra nella dashboard'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
