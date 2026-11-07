import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Archive, CalendarClock, FolderOpen, LayoutGrid, MessageSquare, Play, Plus, RotateCw, Settings, Square, ArrowUpCircle, Unlink, Link2,
} from 'lucide-react';
import { del, get, post, put } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { bytes } from '../lib/format.js';
import {
  Alert, Button, Card, CardHeader, EmptyState, Field, GameBadge, Input, Loading, Select, Tabs, useAction, useConfirm, useToast,
} from '../components/ui.jsx';
import { useServers } from '../components/Layout.jsx';
import { ServerCard } from '../components/ServerBits.jsx';
import CreateServerModal from '../components/CreateServerModal.jsx';
import FileManager from '../components/FileManager.jsx';
import BackupsPanel from '../components/BackupsPanel.jsx';
import SchedulesPanel from '../components/SchedulesPanel.jsx';

const TABS = [
  { id: 'servers', label: 'Servers', icon: LayoutGrid },
  { id: 'files', label: 'Cluster files', icon: FolderOpen },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'schedules', label: 'Schedules', icon: CalendarClock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function ClusterSettings({ cluster, onSaved }) {
  const [name, setName] = useState(cluster.name);
  const [key, setKey] = useState(cluster.clusterKey);
  const [busy, run] = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { reload } = useServers();
  useEffect(() => { setName(cluster.name); setKey(cluster.clusterKey); }, [cluster.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    const res = await confirm({
      title: `Delete cluster "${cluster.name}"?`,
      message: 'The servers are kept but removed from the cluster.',
      danger: true,
      checkbox: 'Also delete the cluster transfer data (uploaded characters, dinos and items)',
      confirmLabel: 'Delete cluster',
    });
    if (!res) return;
    try {
      await del(`/clusters/${cluster.id}?files=${res.checked ? 1 : 0}`);
      reload();
      toast.success('Cluster deleted');
      navigate('/clusters');
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Cluster settings" />
        <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run('save', async () => { await put(`/clusters/${cluster.id}`, { name, clusterKey: key }); onSaved(); }, 'Cluster saved'); }}>
          <Field label="Name"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Cluster ID" hint="Changing this disconnects existing uploads from the servers until changed back. Restart all servers afterwards.">
            <Input className="font-mono" required value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy === 'save'}>Save</Button></div>
        </form>
      </Card>
      <Card className="border-red-500/30">
        <CardHeader title="Danger zone" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-ink-300">Stop all servers in the cluster before deleting it.</p>
          <Button variant="danger" onClick={remove}>Delete cluster</Button>
        </div>
      </Card>
    </div>
  );
}

export default function ClusterDetail() {
  const { id, tab = 'servers' } = useParams();
  const navigate = useNavigate();
  const { servers, reload: reloadAll } = useServers();
  const { data: cluster, error, reload } = usePoll(() => get(`/clusters/${id}`), 3000, [id]);
  const [busy, run] = useAction();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [attach, setAttach] = useState('');

  if (error?.status === 404) return <Alert type="error" title="Cluster not found"><Link className="underline" to="/clusters">Back to clusters</Link></Alert>;
  if (!cluster) return <Loading />;

  const refresh = () => { reload(); reloadAll(); };
  const anyAlive = cluster.servers.some((s) => ['running', 'starting'].includes(s.runtime.state));
  const players = cluster.servers.reduce((a, s) => a + s.runtime.playerCount, 0);
  const attachable = (servers || []).filter((s) => s.game === cluster.game && s.clusterId !== cluster.id);

  const bulk = async (action, label) => {
    let body = {};
    if (['stop', 'restart', 'update'].includes(action) && anyAlive) {
      const res = await confirm({ title: `${label} all servers?`, message: players ? `${players} player(s) are online.` : undefined, confirmLabel: `${label} with 5 min warning`, checkbox: `${label} right now (no warning)` });
      if (!res) return;
      body = { warnMinutes: res.checked ? 0 : 5 };
    }
    run(action, async () => { await post(`/clusters/${cluster.id}/${action}`, body); refresh(); }, action === 'start' ? 'Starting servers one by one (20 s apart)' : `${label} started`);
  };

  const broadcast = async () => {
    const msg = await confirm({ title: 'Broadcast to all servers', input: true, placeholder: 'Message', confirmLabel: 'Send' });
    if (msg) run('bc', () => post(`/clusters/${cluster.id}/broadcast`, { message: msg }), 'Message sent');
  };

  const setCluster = (serverId, clusterId) => run(`attach-${serverId}`, async () => {
    await put(`/servers/${serverId}`, { clusterId });
    setAttach('');
    refresh();
  }, clusterId ? 'Server added to the cluster. Restart it to apply.' : 'Server removed from the cluster. Restart it to apply.');

  return (
    <>
      <Link to="/clusters" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100"><ArrowLeft className="size-4" />Clusters</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5"><h1 className="text-2xl font-semibold tracking-tight">{cluster.name}</h1><GameBadge game={cluster.game} /></div>
          <p className="num mt-1 text-sm text-ink-300">
            <span className="font-mono">{cluster.clusterKey}</span> · {cluster.servers.length} servers · {cluster.servers.filter((s) => s.runtime.state === 'running').length} online · {players} players · transfer data {bytes(cluster.dataSize)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="success" icon={Play} loading={busy === 'start'} onClick={() => bulk('start', 'Start')}>Start all</Button>
          <Button icon={RotateCw} disabled={!anyAlive} loading={busy === 'restart'} onClick={() => bulk('restart', 'Restart')}>Restart all</Button>
          <Button variant="danger" icon={Square} disabled={!anyAlive} loading={busy === 'stop'} onClick={() => bulk('stop', 'Stop')}>Stop all</Button>
          <Button variant="ghost" icon={ArrowUpCircle} loading={busy === 'update'} onClick={() => bulk('update', 'Update')}>Update all</Button>
          <Button variant="ghost" icon={MessageSquare} disabled={!anyAlive} onClick={broadcast}>Broadcast</Button>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={(t) => navigate(`/clusters/${id}/${t === 'servers' ? '' : t}`)} />

      <div className="mt-5">
        {tab === 'servers' && (
          <div className="space-y-5">
            {cluster.servers.length === 0 ? (
              <Card>
                <EmptyState icon={LayoutGrid} title="This cluster has no servers yet" action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Add a new server</Button>}>
                  Add one server per map. All servers in the cluster can transfer survivors, dinos and items to each other.
                </EmptyState>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {cluster.servers.map((s) => (
                  <div key={s.id} className="relative">
                    <ServerCard server={s} />
                    <button type="button" title="Remove from cluster" aria-label="Remove from cluster" onClick={async () => { if (await confirm({ title: `Remove "${s.name}" from the cluster?`, confirmLabel: 'Remove' })) setCluster(s.id, null); }}
                      className="absolute bottom-3 left-4 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-400 hover:bg-ink-700 hover:text-ink-100"><Unlink className="size-3.5" />Remove</button>
                  </div>
                ))}
              </div>
            )}
            <Card>
              <CardHeader title="Add servers" />
              <div className="flex flex-wrap items-end gap-4 p-5">
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New server in this cluster</Button>
                {attachable.length > 0 && (
                  <div className="flex min-w-72 flex-1 items-end gap-2">
                    <Field label="...or move an existing server here" className="flex-1">
                      <Select value={attach} onChange={(e) => setAttach(e.target.value)}>
                        <option value="">Choose a server</option>
                        {attachable.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.mapName}){s.cluster ? ` · in ${s.cluster.name}` : ''}</option>)}
                      </Select>
                    </Field>
                    <Button icon={Link2} disabled={!attach} loading={busy === `attach-${attach}`} onClick={() => setCluster(attach, cluster.id)}>Add</Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
        {tab === 'files' && (
          <FileManager rootType="cluster" rootId={cluster.id}
            warning={<Alert type="info">This is the shared cluster folder (-ClusterDirOverride). It holds uploaded survivors, dinos and items.</Alert>} />
        )}
        {tab === 'backups' && <BackupsPanel kind="clusters" id={cluster.id} description="Backups of the shared transfer data. Server save games are backed up per server." />}
        {tab === 'schedules' && <SchedulesPanel targetType="cluster" targetId={cluster.id} subtitle="Tasks run on every server in this cluster at the same time" />}
        {tab === 'settings' && <ClusterSettings cluster={cluster} onSaved={refresh} />}
      </div>
      <CreateServerModal open={creating} onClose={() => { setCreating(false); refresh(); }} defaults={{ game: cluster.game, clusterId: cluster.id }} />
    </>
  );
}
