import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Server } from 'lucide-react';
import { bytes, pct } from '../lib/format.js';
import { Button, Card, EmptyState, GameBadge, Loading, PageHeader, StatusBadge, cx } from '../components/ui.jsx';
import { useServers } from '../components/Layout.jsx';
import { JobProgress, PowerButtons } from '../components/ServerBits.jsx';
import CreateServerModal from '../components/CreateServerModal.jsx';

export default function Servers() {
  const { servers } = useServers();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');
  const list = (servers || []).filter((s) => filter === 'all' || s.game === filter);

  return (
    <>
      <PageHeader title="Servers" subtitle="All game servers on this host"
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New server</Button>} />

      <div className="mb-4 flex gap-1">
        {[['all', 'All'], ['asa', 'Ascended'], ['ase', 'Evolved']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            className={cx('rounded-lg px-3 py-1.5 text-sm', filter === id ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:text-ink-100')}>{label}</button>
        ))}
      </div>

      {servers === undefined ? <Loading /> : list.length === 0 ? (
        <Card><EmptyState icon={Server} title="No servers" action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New server</Button>}>Create a server to get started.</EmptyState></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-700 text-left text-xs text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Server</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Players</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">CPU / RAM</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Port</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {list.map((s) => {
                  const alive = ['running', 'starting'].includes(s.runtime.state);
                  return (
                    <tr key={s.id} className="hover:bg-ink-800/50">
                      <td className="px-4 py-3">
                        <Link to={`/servers/${s.id}`} className="group block min-w-0">
                          <div className="flex items-center gap-2"><GameBadge game={s.game} /><span className="truncate font-medium group-hover:text-brand-300">{s.name}</span></div>
                          <div className="mt-0.5 truncate text-xs text-ink-400">{s.mapName}{s.cluster ? ` · ${s.cluster.name}` : ''}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">{s.runtime.job ? <div className="w-40"><JobProgress job={s.runtime.job} /></div> : <StatusBadge server={s} />}</td>
                      <td className="num hidden px-4 py-3 md:table-cell">{alive ? `${s.runtime.playerCount}/${s.maxPlayers}` : '—'}</td>
                      <td className="num hidden px-4 py-3 text-ink-200 lg:table-cell">{alive ? `${pct(s.runtime.cpu)} · ${bytes(s.runtime.memory)}` : '—'}</td>
                      <td className="num hidden px-4 py-3 text-ink-300 md:table-cell">{s.ports.game}</td>
                      <td className="px-4 py-3"><div className="flex justify-end"><PowerButtons server={s} size="sm" showLabels={false} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <CreateServerModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
