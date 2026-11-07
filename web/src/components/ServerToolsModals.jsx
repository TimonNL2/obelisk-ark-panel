import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api.js';
import { useApp } from '../App.jsx';
import { Alert, Button, Field, GameBadge, Input, Modal, Select, StatusDot, Toggle, cx } from './ui.jsx';
import { useServers } from './Layout.jsx';

const CUSTOM = '__custom__';

/** Checkbox row used in both dialogs. */
function Check({ checked, onChange, children, sub }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors', checked ? 'border-brand-500/50 bg-brand-400/[0.06]' : 'border-ink-700 hover:border-ink-600')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-400)]" />
      <span className="min-w-0">
        <span className="block text-sm text-ink-100">{children}</span>
        {sub && <span className="block text-xs text-ink-400">{sub}</span>}
      </span>
    </label>
  );
}

export function CopySettingsModal({ open, onClose, server, defaultParts = ['game'], dirtyWarning }) {
  const { meta } = useApp();
  const { servers, reload } = useServers();
  const [targets, setTargets] = useState([]);
  const [parts, setParts] = useState(defaultParts);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const candidates = useMemo(() => (servers || []).filter((s) => s.game === server.game && s.id !== server.id), [servers, server]);
  useEffect(() => {
    if (!open) return;
    // pre-select the other servers of the same cluster
    setTargets(server.clusterId ? candidates.filter((s) => s.clusterId === server.clusterId).map((s) => s.id) : []);
    setParts(defaultParts);
    setResult(null);
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list, setList, id, on) => setList(on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await post(`/servers/${server.id}/copy-settings`, { targets, parts });
      setResult(res.results);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Copy settings from ${server.name}`} size="lg"
      footer={result ? <Button variant="primary" onClick={onClose}>Done</Button> : <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!targets.length || !parts.length} onClick={submit}>
          Copy to {targets.length || ''} server{targets.length === 1 ? '' : 's'}
        </Button>
      </>}>
      {result ? (
        <div className="space-y-2">
          <Alert type="success" title="Settings copied">Running servers use the new settings after their next restart.</Alert>
          {result.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2 text-sm">
              <span>{r.name || r.id}</span>
              <span className={r.ok ? 'text-beam-online' : 'text-red-300'}>{r.ok ? (r.running ? 'copied, restart to apply' : 'copied') : r.error}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {error && <Alert type="error">{error}</Alert>}
          {dirtyWarning && <Alert type="warning">You have unsaved changes on this page. Only saved settings are copied.</Alert>}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-200">What to copy</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(meta.copyParts).map(([id, label]) => (
                <Check key={id} checked={parts.includes(id)} onChange={(on) => toggle(parts, setParts, id, on)}>{label}</Check>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-200">Copy to</h3>
              {candidates.length > 1 && (
                <button type="button" className="text-xs text-brand-300 hover:underline" onClick={() => setTargets(targets.length === candidates.length ? [] : candidates.map((s) => s.id))}>
                  {targets.length === candidates.length ? 'Select none' : 'Select all'}
                </button>
              )}
            </div>
            {candidates.length === 0 ? (
              <p className="text-sm text-ink-400">There are no other {server.gameShort} servers yet. Use “Clone server” to make one with these settings.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {candidates.map((s) => (
                  <Check key={s.id} checked={targets.includes(s.id)} onChange={(on) => toggle(targets, setTargets, s.id, on)}
                    sub={`${s.mapName}${s.cluster ? `, ${s.cluster.name}` : ''}`}>
                    <span className="inline-flex items-center gap-2"><StatusDot server={s} />{s.name}</span>
                  </Check>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CloneServerModal({ open, onClose, server }) {
  const { meta } = useApp();
  const { clusters, reload } = useServers();
  const navigate = useNavigate();
  const game = meta.games.find((g) => g.id === server.game);
  const [form, setForm] = useState(null);
  const [customMap, setCustomMap] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    const used = new Set(); // suggest a map the cluster doesn't have yet
    for (const c of clusters || []) if (c.id === server.clusterId) for (const s of c.servers) used.add(s.map);
    const nextMap = game.maps.find((m) => !used.has(m.id))?.id || server.map;
    setForm({ name: '', map: nextMap, mapModId: '', clusterId: server.clusterId || '', copySchedules: true, install: true });
    setCustomMap('');
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return null;
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const mapInfo = game.maps.find((m) => m.id === form.map);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, map: form.map === CUSTOM ? customMap.trim() : form.map, clusterId: form.clusterId || null };
      const created = await post(`/servers/${server.id}/clone`, body);
      reload();
      onClose();
      navigate(`/servers/${created.id}/console`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2">Clone {server.name} <GameBadge game={server.game} /></span>}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="clone-form" loading={busy}>{form.install ? 'Clone & install' : 'Clone'}</Button></>}>
      <form id="clone-form" onSubmit={submit} className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        <p className="text-sm text-ink-300">The new server gets the same game settings, config files, mods, passwords and options. Save data is not copied. It gets its own free ports.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input autoFocus required maxLength={64} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Scorched Earth" /></Field>
          <Field label="Map">
            <Select value={form.map} onChange={(e) => set({ map: e.target.value, mapModId: '' })}>
              {game.maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value={CUSTOM}>Custom / mod map...</option>
            </Select>
            {form.map === CUSTOM && <Input className="mt-2" required value={customMap} onChange={(e) => setCustomMap(e.target.value)} placeholder="MapName_WP" />}
          </Field>
          {(form.map === CUSTOM || mapInfo?.modHint) && (
            <Field label="Map mod ID (optional)" hint={mapInfo?.note || 'The CurseForge / Workshop ID of the map mod, if the map is a mod.'}>
              <Input inputMode="numeric" value={form.mapModId} onChange={(e) => set({ mapModId: e.target.value.replace(/\D/g, '') })} placeholder={mapInfo?.modHint || ''} />
            </Field>
          )}
          <Field label="Cluster">
            <Select value={form.clusterId} onChange={(e) => set({ clusterId: e.target.value })}>
              <option value="">No cluster</option>
              {(clusters || []).filter((c) => c.game === server.game).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="divide-y divide-ink-700/60 rounded-xl border border-ink-700 px-4">
          <Toggle checked={form.copySchedules} onChange={(v) => set({ copySchedules: v })} label="Copy scheduled tasks" description="Restarts, backups and messages of this server." />
          <Toggle checked={form.install} onChange={(v) => set({ install: v })} label="Install the game files now" description="Copied from this server's files, so no full download is needed." />
        </div>
      </form>
    </Modal>
  );
}
