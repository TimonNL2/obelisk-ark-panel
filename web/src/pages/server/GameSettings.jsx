import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Search } from 'lucide-react';
import { get, put } from '../../lib/api.js';
import { Alert, Button, Card, CardHeader, Input, Loading, Select, cx, useToast } from '../../components/ui.jsx';

const keyOf = (d) => `${d.file}|${d.section}|${d.key}`;

export default function GameSettings({ server }) {
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [initial, setInitial] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const running = ['running', 'starting'].includes(server.runtime.state);

  const load = async () => {
    const d = await get(`/servers/${server.id}/game-settings`);
    const v = {};
    for (const def of d.catalog) {
      const o = d.overrides?.[def.file]?.[def.section]?.[def.key];
      if (o !== undefined) v[keyOf(def)] = def.type === 'bool' ? (/^true$/i.test(o) ? 'true' : 'false') : o;
    }
    setData(d);
    setValues(v);
    setInitial(v);
  };
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [server.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase();
    const map = new Map();
    for (const def of data.catalog) {
      if (s && !`${def.label} ${def.key} ${def.help}`.toLowerCase().includes(s)) continue;
      if (!map.has(def.category)) map.set(def.category, []);
      map.get(def.category).push(def);
    }
    return [...map.entries()];
  }, [data, search]);

  if (!data) return <Loading />;

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const changedCount = Object.keys(values).filter((k) => values[k] !== '' && values[k] !== undefined).length;

  const save = async () => {
    setSaving(true);
    try {
      const overrides = {};
      for (const def of data.catalog) {
        const v = values[keyOf(def)];
        if (v === undefined || v === '') continue;
        overrides[def.file] ||= {};
        overrides[def.file][def.section] ||= {};
        overrides[def.file][def.section][def.key] = def.type === 'bool' ? v === 'true' : v;
      }
      const res = await put(`/servers/${server.id}/game-settings`, { overrides });
      toast.success(res.appliedNow ? 'Game settings saved and written to the config files' : 'Saved. They are applied on the next (re)start.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Alert type="info">
        Empty fields use the game default. Values set here are written into GameUserSettings.ini / Game.ini <b>every time the server starts</b>,
        so ARK can't overwrite them. For anything not listed, use the Config files tab.
        {running && <> The server is running: changes apply on the next restart.</>}
      </Alert>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input className="pl-9" placeholder="Search settings..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-xs text-ink-400">{changedCount} custom value(s)</span>
      </div>

      {groups.map(([category, defs]) => (
        <Card key={category}>
          <CardHeader title={category} />
          <div className="grid gap-x-8 px-5 py-2 md:grid-cols-2">
            {defs.map((def) => {
              const k = keyOf(def);
              const v = values[k] ?? '';
              const fileVal = data.current?.[def.file]?.[def.section]?.[def.key];
              return (
                <div key={k} className="flex items-center justify-between gap-4 border-b border-ink-700/50 py-3 last:border-0 md:[&:nth-last-child(2)]:border-0">
                  <div className="min-w-0">
                    <div className={cx('text-sm', v !== '' ? 'text-brand-300' : 'text-ink-100')}>{def.label}</div>
                    <div className="truncate font-mono text-[11px] text-ink-400" title={`${def.file} [${def.section}] ${def.key}`}>{def.key}{def.file === 'Game.ini' ? ' · Game.ini' : ''}</div>
                    {def.help && <div className="mt-0.5 text-xs text-ink-400">{def.help}</div>}
                  </div>
                  <div className="flex w-40 shrink-0 items-center gap-1">
                    {def.type === 'bool' ? (
                      <Select value={v} onChange={(e) => setValues({ ...values, [k]: e.target.value })} className="h-9 py-1.5">
                        <option value="">Default{fileVal !== undefined ? ` (${fileVal})` : ''}</option>
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </Select>
                    ) : (
                      <Input type="number" step="any" className="h-9 py-1.5 text-right" value={v} placeholder={fileVal ?? def.placeholder}
                        onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
                    )}
                    {v !== '' && (
                      <button type="button" title="Reset to default" aria-label="Reset" onClick={() => { const n = { ...values }; delete n[k]; setValues(n); }} className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"><RotateCcw className="size-3.5" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button variant="primary" size="lg" icon={Save} disabled={!dirty} loading={saving} onClick={save} className="shadow-xl shadow-black/40">Save game settings</Button>
      </div>
    </div>
  );
}
