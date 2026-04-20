import { useEffect, useState } from 'react';
import SectionCard from '../components/SectionCard';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { fetchLogs, getErrorMessage } from '../lib/api';
import { formatDate } from '../lib/utils';

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [agent, setAgent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadLogs(selectedAgent = agent) {
    try {
      setLoading(true);
      setError('');
      const data = await fetchLogs({
        agent: selectedAgent || undefined,
        limit: 100,
        offset: 0,
      });
      setLogs(data.logs || []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Impossibile caricare i log agenti.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="space-y-6">
      <SectionCard
        eyebrow="Amministrazione"
        title="Storico attività agenti"
        description="Filtra i log per agente e controlla il dettaglio delle operazioni eseguite."
        actions={
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={agent}
              onChange={(event) => setAgent(event.target.value)}
              placeholder="Filtro agente, es. agent-api"
              className="rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => loadLogs(agent)}
              className="rounded-[16px] bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Applica filtro
            </button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Volume</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{logs.length}</p>
          </div>
          <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Filtro attivo</p>
            <p className="mt-2 text-sm font-semibold text-ink">{agent || 'Nessun filtro'}</p>
          </div>
          <div className="rounded-[18px] border border-brand-100 bg-brand-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-brand-500">Uso</p>
            <p className="mt-2 text-sm font-semibold text-brand-900">Debug rapido di errori, publish e rigenerazioni</p>
          </div>
        </div>
      </SectionCard>

      {loading ? <LoadingState label="Caricamento log agenti..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => loadLogs(agent)} /> : null}
      {!loading && !error ? (
        <section className="overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  {['Timestamp', 'Agente', 'Azione', 'Dettaglio'].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-4 text-left text-xs font-bold uppercase tracking-[0.18em] text-neutral-500"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.length ? (
                  logs.map((log) => (
                    <tr key={log.id} className="align-top hover:bg-neutral-50/60">
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-neutral-600">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-ink">{log.agent}</td>
                      <td className="px-4 py-4 text-sm text-neutral-700">{log.azione}</td>
                      <td className="px-4 py-4 text-xs text-neutral-500">
                        <pre className="whitespace-pre-wrap break-words rounded-[16px] bg-neutral-50 p-3 font-mono">
                          {log.dettaglio ? JSON.stringify(log.dettaglio, null, 2) : 'n.d.'}
                        </pre>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="px-4 py-10 text-center text-sm text-neutral-500">
                      Nessun log disponibile per i filtri selezionati.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
