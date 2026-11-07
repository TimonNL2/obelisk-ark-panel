import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { get, post } from '../lib/api.js';
import { useApp } from '../App.jsx';
import { Alert, Button, Field, Input, Modal, Select, Toggle, cx } from './ui.jsx';
import { useServers } from './Layout.jsx';

const CUSTOM = '__custom__';

export default function CreateServerModal({ open, onClose, defaults = {} }) {
  const { meta } = useApp();
  const { clusters, reload } = useServers();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [customMap, setCustomMap] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const game = meta.games.find((g) => g.id === form?.game);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    const g = defaults.game || 'asa';
    setForm({
      game: g,
      name: '',
      map: meta.games.find((x) => x.id === g).maps[0].id,
      maxPlayers: meta.games.find((x) => x.id === g).defaultMaxPlayers,
      serverPassword: '',
      adminPassword: '',
      clusterId: defaults.clusterId || '',
      install: true,
      ports: null,
    });
    setError(null);
    setAdvanced(false);
    setCustomMap('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !form?.game) return;
    get(`/servers/suggest-ports?game=${form.game}`).then((ports) => set({ ports })).catch(() => {});
  }, [open, form?.game]);

  if (!open || !form) return null;

  const changeGame = (g) => {
    const gm = meta.games.find((x) => x.id === g);
    const cluster = clusters?.find((c) => c.id === form.clusterId);
    set({ game: g, map: gm.maps[0].id, maxPlayers: gm.defaultMaxPlayers, clusterId: cluster && cluster.game !== g ? '' : form.clusterId });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, map: form.map === CUSTOM ? customMap.trim() : form.map, clusterId: form.clusterId || null };
      if (!advanced) delete body.ports;
      const server = await post('/servers', body);
      reload();
      onClose();
      navigate(`/servers/${server.id}/console`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const gameClusters = (clusters || []).filter((c) => c.game === form.game);

  return (
    <Modal open={open} onClose={onClose} title="Create a new server" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="create-server" loading={busy}>{form.install ? 'Create & install' : 'Create server'}</Button>
      </>}>
      <form id="create-server" onSubmit={submit} className="space-y-5">
        {error && <Alert type="error">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          {meta.games.map((g) => (
            <button key={g.id} type="button" onClick={() => changeGame(g.id)}
              className={cx('rounded-xl border p-4 text-left transition-colors', form.game === g.id ? 'border-brand-500 bg-brand-500/10' : 'border-ink-600 bg-ink-900 hover:border-ink-500')}>
              <div className="text-sm font-semibold">{g.name}</div>
              <div className="mt-1 text-xs text-ink-300">{g.id === 'asa' ? 'Unreal Engine 5 · runs through GE-Proton' : 'Classic ARK · native Linux server'}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Server name" hint="Shown in the panel and used as the in-game session name (you can change it later).">
            <Input autoFocus required maxLength={64} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="My Island Server" />
          </Field>
          <Field label="Map">
            <Select value={form.map} onChange={(e) => set({ map: e.target.value })}>
              {game.maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value={CUSTOM}>Custom / mod map...</option>
            </Select>
            {form.map === CUSTOM && <Input className="mt-2" required value={customMap} onChange={(e) => setCustomMap(e.target.value)} placeholder="e.g. Svartalfheim_WP" />}
          </Field>
          <Field label="Cluster" hint={gameClusters.length ? 'Servers in the same cluster can transfer characters, dinos and items.' : 'No clusters for this game yet. Create one on the Clusters page.'}>
            <Select value={form.clusterId} onChange={(e) => set({ clusterId: e.target.value })}>
              <option value="">No cluster (standalone)</option>
              {gameClusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Max players">
            <Input type="number" min={1} max={255} value={form.maxPlayers} onChange={(e) => set({ maxPlayers: Number(e.target.value) })} />
          </Field>
          <Field label="Server password" hint="Leave empty for a public server.">
            <Input value={form.serverPassword} onChange={(e) => set({ serverPassword: e.target.value })} placeholder="(none)" autoComplete="off" />
          </Field>
          <Field label="Admin password" hint="Used for RCON and in-game admin. Leave empty to generate one.">
            <Input value={form.adminPassword} onChange={(e) => set({ adminPassword: e.target.value })} placeholder="(generated)" autoComplete="off" />
          </Field>
        </div>

        <div>
          <button type="button" onClick={() => setAdvanced(!advanced)} className="flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100">
            {advanced ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Ports {form.ports && <span className="text-ink-400">(game {form.ports.game}{form.ports.query ? `, query ${form.ports.query}` : ''}, RCON {form.ports.rcon})</span>}
          </button>
          {advanced && form.ports && (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Game port (UDP)"><Input type="number" value={form.ports.game} onChange={(e) => set({ ports: { ...form.ports, game: Number(e.target.value) } })} /></Field>
              {game.usesQueryPort && <Field label="Query port (UDP)"><Input type="number" value={form.ports.query} onChange={(e) => set({ ports: { ...form.ports, query: Number(e.target.value) } })} /></Field>}
              <Field label="RCON port (TCP)"><Input type="number" value={form.ports.rcon} onChange={(e) => set({ ports: { ...form.ports, rcon: Number(e.target.value) } })} /></Field>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-1">
          <Toggle checked={form.install} onChange={(v) => set({ install: v })} label="Download the game files now"
            description={form.game === 'asa' ? 'About 13 GB through SteamCMD. If another ASA server exists, its files are copied instead.' : 'About 20 GB through SteamCMD. If another ASE server exists, its files are copied instead.'} />
        </div>
      </form>
    </Modal>
  );
}
