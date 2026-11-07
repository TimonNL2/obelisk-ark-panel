import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { del, put } from '../../lib/api.js';
import { useApp } from '../../App.jsx';
import { useServers } from '../../components/Layout.jsx';
import { Alert, Button, Card, CardHeader, Field, Input, SaveBar, Select, Textarea, Toggle, useConfirm, useToast } from '../../components/ui.jsx';

const CUSTOM = '__custom__';
const randomPw = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

function pick(s) {
  return {
    name: s.name, sessionName: s.sessionName, map: s.map, maxPlayers: s.maxPlayers, serverPassword: s.serverPassword || '',
    adminPassword: s.adminPassword, clusterId: s.clusterId || '', ports: { ...s.ports }, battleye: !!s.battleye,
    crossplay: s.crossplay !== false, autoStart: !!s.autoStart, autoRestart: !!s.autoRestart, autoUpdate: !!s.autoUpdate, virtualDisplay: !!s.virtualDisplay,
    motd: s.motd || '', motdDuration: s.motdDuration || 30, extraArgs: s.extraArgs || '', extraUrlParams: s.extraUrlParams || '',
  };
}

export default function StartupSettings({ server, onSaved }) {
  const { meta } = useApp();
  const { clusters, reload } = useServers();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const game = meta.games.find((g) => g.id === server.game);
  const [form, setForm] = useState(() => pick(server));
  const [customMap, setCustomMap] = useState(game.maps.some((m) => m.id === server.map) ? '' : server.map);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setForm(pick(server)); }, [server.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const mapValue = game.maps.some((m) => m.id === form.map) ? form.map : CUSTOM;
  const running = ['running', 'starting'].includes(server.runtime.state);
  const dirty = JSON.stringify(pick(server)) !== JSON.stringify(form);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await put(`/servers/${server.id}`, { ...form, clusterId: form.clusterId || null });
      toast.success(running ? 'Saved. Restart the server to apply the changes.' : 'Settings saved');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const res = await confirm({
      title: `Delete "${server.name}"?`,
      message: 'All game files and save data of this server are deleted permanently.',
      danger: true,
      typeToConfirm: server.name,
      checkbox: 'Also delete all backups of this server',
      confirmLabel: 'Delete server',
    });
    if (!res) return;
    try {
      await del(`/servers/${server.id}?backups=${res.checked ? 1 : 0}`);
      toast.success('Server deleted');
      reload();
      navigate('/servers');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const gameClusters = (clusters || []).filter((c) => c.game === server.game);

  return (
    <form onSubmit={save} className="space-y-5">
      {running && <Alert type="info">Changes are saved immediately but only take effect after a restart.</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <Card>
        <CardHeader title="General" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Display name" hint="Name in this panel."><Input required value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Session name" hint="Name players see in the server browser."><Input required value={form.sessionName} onChange={(e) => set({ sessionName: e.target.value })} /></Field>
          <Field label="Map">
            <Select value={mapValue} onChange={(e) => set({ map: e.target.value === CUSTOM ? customMap || '' : e.target.value })}>
              {game.maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value={CUSTOM}>Custom / mod map...</option>
            </Select>
            {mapValue === CUSTOM && <Input className="mt-2" required value={form.map} placeholder="MapName_WP" onChange={(e) => { setCustomMap(e.target.value); set({ map: e.target.value }); }} />}
          </Field>
          <Field label="Max players"><Input type="number" min={1} max={255} value={form.maxPlayers} onChange={(e) => set({ maxPlayers: Number(e.target.value) })} /></Field>
          <Field label="Server password" hint="Leave empty for a public server."><Input value={form.serverPassword} autoComplete="off" onChange={(e) => set({ serverPassword: e.target.value })} placeholder="(none)" /></Field>
          <Field label="Admin password" hint="Used by the panel for RCON. Changing it requires a restart.">
            <div className="flex gap-2">
              <Input type={showPw ? 'text' : 'password'} required autoComplete="new-password" value={form.adminPassword} onChange={(e) => set({ adminPassword: e.target.value })} />
              <Button size="icon" className="h-[38px] w-[38px]" aria-label={showPw ? 'Hide' : 'Show'} onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
              <Button size="icon" className="h-[38px] w-[38px]" aria-label="Generate" title="Generate new password" onClick={() => { set({ adminPassword: randomPw() }); setShowPw(true); }}><RefreshCw className="size-4" /></Button>
            </div>
          </Field>
          <Field label="Cluster" hint="Servers in a cluster share character, dino and item transfers.">
            <Select value={form.clusterId} onChange={(e) => set({ clusterId: e.target.value })}>
              <option value="">No cluster</option>
              {gameClusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Network" subtitle="Forward these ports on your router / firewall to this machine" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Game port (UDP)" hint={server.game === 'ase' ? `Also uses ${form.ports.game + 1}` : undefined}><Input type="number" value={form.ports.game} onChange={(e) => set({ ports: { ...form.ports, game: Number(e.target.value) } })} /></Field>
          {game.usesQueryPort && <Field label="Query port (UDP)"><Input type="number" value={form.ports.query} onChange={(e) => set({ ports: { ...form.ports, query: Number(e.target.value) } })} /></Field>}
          <Field label="RCON port (TCP)" hint="Only needed locally, no need to forward."><Input type="number" value={form.ports.rcon} onChange={(e) => set({ ports: { ...form.ports, rcon: Number(e.target.value) } })} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Behaviour" />
        <div className="divide-y divide-ink-700/60 px-5 py-1">
          <Toggle checked={form.autoStart} onChange={(v) => set({ autoStart: v })} label="Start automatically" description="Start this server when the panel / machine boots." />
          <Toggle checked={form.autoRestart} onChange={(v) => set({ autoRestart: v })} label="Restart after a crash" description="Automatically start the server again when it stops unexpectedly." />
          <Toggle checked={form.autoUpdate} onChange={(v) => set({ autoUpdate: v })} label="Update automatically" description="When a game update is released, warn players 5 minutes, update and restart." />
          {server.game === 'asa'
            ? <Toggle checked={form.crossplay} onChange={(v) => set({ crossplay: v })} label="Crossplay" description="Allow Xbox, PlayStation and Windows Store players (-ServerPlatform=PC+XSX+WINGDK+PS5)." />
            : <Toggle checked={form.crossplay} onChange={(v) => set({ crossplay: v })} label="Crossplay (Epic)" description="Allow Epic Games Store players to join (-crossplay)." />}
          <Toggle checked={form.battleye} onChange={(v) => set({ battleye: v })} label="BattlEye anti-cheat" description="Off adds -NoBattlEye. BattlEye under Proton may not work on every setup." />
          {server.game === 'asa' && <Toggle checked={form.virtualDisplay} onChange={(v) => set({ virtualDisplay: v })} label="Virtual display (troubleshooting)" description="Runs the server inside Xvfb with -dx11. Only turn this on if the server crashes or hangs on start with the default setup." />}
        </div>
      </Card>

      <Card>
        <CardHeader title="Message of the day" subtitle="Shown to players when they join" />
        <div className="grid gap-4 p-5 sm:grid-cols-4">
          <Field label="Message" className="sm:col-span-3"><Textarea rows={2} value={form.motd} onChange={(e) => set({ motd: e.target.value })} placeholder="Welcome! Rules: be nice." /></Field>
          <Field label="Duration (s)"><Input type="number" min={5} max={600} value={form.motdDuration} onChange={(e) => set({ motdDuration: Number(e.target.value) })} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Advanced" subtitle="Only change these if you know what they do" />
        <div className="grid gap-4 p-5">
          <Field label="Extra command line arguments" hint="Added to the launch command, e.g. -ForceAllowCaveFlyers -NoWildBabies">
            <Input className="font-mono" value={form.extraArgs} onChange={(e) => set({ extraArgs: e.target.value })} />
          </Field>
          <Field label="Extra URL options" hint="Appended to the map URL, e.g. ?AltSaveDirectoryName=Island2?PreventHibernation=true">
            <Input className="font-mono" value={form.extraUrlParams} onChange={(e) => set({ extraUrlParams: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card className="border-red-500/30">
        <CardHeader title="Danger zone" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-ink-300">Delete this server, its game files and its save data.</p>
          <Button variant="danger" icon={Trash2} disabled={running} title={running ? 'Stop the server first' : undefined} onClick={remove}>Delete server</Button>
        </div>
      </Card>

      <SaveBar show={dirty} saving={saving} onSave={save} onDiscard={() => setForm(pick(server))} label="Save settings"
        count={Object.keys(form).filter((k) => JSON.stringify(form[k]) !== JSON.stringify(pick(server)[k])).length} />
    </form>
  );
}
