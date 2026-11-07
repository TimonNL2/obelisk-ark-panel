import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Network, Plus } from 'lucide-react';
import { post } from '../lib/api.js';
import { useApp } from '../App.jsx';
import { Alert, Button, Card, EmptyState, Field, GameBadge, Input, Loading, Modal, PageHeader, Select, StatusBadge } from '../components/ui.jsx';
import { useServers } from '../components/Layout.jsx';

export function CreateClusterModal({ open, onClose }) {
  const { meta } = useApp();
  const { reload } = useServers();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', game: 'asa', clusterKey: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await post('/clusters', { ...form, clusterKey: form.clusterKey || undefined });
      reload();
      onClose();
      setForm({ name: '', game: 'asa', clusterKey: '' });
      navigate(`/clusters/${c.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create a cluster"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="cluster-form" variant="primary" loading={busy}>Create cluster</Button></>}>
      <form id="cluster-form" onSubmit={submit} className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        <p className="text-sm text-ink-300">A cluster links several servers (usually different maps) so players can travel between them with their characters, dinos and items via obelisks / terminals.</p>
        <Field label="Name"><Input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My PvE Cluster" /></Field>
        <Field label="Game" hint="ASA and ASE servers cannot share a cluster.">
          <Select value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })}>
            {meta.games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Cluster ID (optional)" hint="Passed to the game as -clusterid. Generated from the name if empty.">
          <Input className="font-mono" value={form.clusterKey} onChange={(e) => setForm({ ...form, clusterKey: e.target.value })} placeholder="my-pve-cluster" />
        </Field>
      </form>
    </Modal>
  );
}

export default function Clusters() {
  const { clusters } = useServers();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader title="Clusters" subtitle="Groups of servers that share character and dino transfers"
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New cluster</Button>} />
      {clusters === undefined ? <Loading /> : clusters.length === 0 ? (
        <Card>
          <EmptyState icon={Network} title="No clusters yet" action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Create a cluster</Button>}>
            Create a cluster, then add servers with different maps to it. The panel sets up the shared cluster folder and launch options for you.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clusters.map((c) => {
            const online = c.servers.filter((s) => s.runtime.state === 'running').length;
            const players = c.servers.reduce((a, s) => a + s.runtime.playerCount, 0);
            return (
              <Link key={c.id} to={`/clusters/${c.id}`}>
                <Card className="h-full p-5 transition-colors hover:border-ink-600">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><GameBadge game={c.game} /><h3 className="truncate font-semibold">{c.name}</h3></div>
                      <p className="mt-1 font-mono text-xs text-ink-400">{c.clusterKey}</p>
                    </div>
                    <Network className="size-5 shrink-0 text-ink-400" />
                  </div>
                  <div className="num mt-4 flex gap-4 text-sm text-ink-300">
                    <span><b className="text-ink-100">{c.servers.length}</b> servers</span>
                    <span><b className="text-ink-100">{online}</b> online</span>
                    <span><b className="text-ink-100">{players}</b> players</span>
                  </div>
                  {c.servers.length > 0 && (
                    <div className="mt-4 space-y-1.5 border-t border-ink-700 pt-3">
                      {c.servers.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate text-ink-200">{s.name} <span className="text-ink-400">· {s.mapName}</span></span>
                          <StatusBadge server={s} className="shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <CreateClusterModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
