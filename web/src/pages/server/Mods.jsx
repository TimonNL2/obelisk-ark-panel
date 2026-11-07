import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Puzzle, Save, Trash2 } from 'lucide-react';
import { put } from '../../lib/api.js';
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, Toggle, useToast } from '../../components/ui.jsx';

export default function Mods({ server, onSaved }) {
  const [mods, setMods] = useState(server.mods || []);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const isAsa = server.game === 'asa';
  const running = ['running', 'starting'].includes(server.runtime.state);

  useEffect(() => { setMods(server.mods || []); }, [server.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(mods) !== JSON.stringify(server.mods || []);

  const add = (e) => {
    e.preventDefault();
    const ids = newId.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    const bad = ids.filter((x) => !/^\d+$/.test(x));
    if (bad.length) { toast.error(`Mod IDs are numbers only (${bad.join(', ')})`); return; }
    const fresh = ids.filter((id) => !mods.some((m) => m.id === id)).map((id) => ({ id, name: ids.length === 1 ? newName.trim() : '', enabled: true }));
    setMods([...mods, ...fresh]);
    setNewId('');
    setNewName('');
  };

  const move = (i, d) => {
    const next = [...mods];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setMods(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await put(`/servers/${server.id}`, { mods });
      toast.success(running ? 'Mods saved. Restart the server to load them.' : 'Mods saved');
      onSaved?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const link = (id) => (isAsa ? `https://www.curseforge.com/ark-survival-ascended/search?search=${id}` : `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`);

  return (
    <div className="space-y-5">
      <Alert type="info">
        {isAsa
          ? <>ASA mods come from <b>CurseForge</b>. Copy the <b>Project ID</b> from the mod page. The server downloads and updates mods itself on start (passed as <code className="font-mono">-mods=</code>).</>
          : <>ASE mods come from the <b>Steam Workshop</b>. Use the number at the end of the workshop URL. Mods are downloaded on start with <code className="font-mono">-automanagedmods</code>.</>}
        {' '}The order below is the load order.
      </Alert>

      <Card>
        <CardHeader icon={Plus} title="Add mod" />
        <form onSubmit={add} className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={isAsa ? 'CurseForge project ID(s)' : 'Workshop ID(s)'} hint="Separate multiple IDs with commas.">
            <Input className="font-mono" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder={isAsa ? '928988' : '731604991'} />
          </Field>
          <Field label="Name (optional)" hint="Just a label for you.">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Structures Plus" />
          </Field>
          <Button type="submit" icon={Plus} disabled={!newId.trim()} className="sm:mb-6">Add</Button>
        </form>
      </Card>

      <Card>
        <CardHeader icon={Puzzle} title={`Installed mods (${mods.filter((m) => m.enabled !== false).length} active)`} />
        {mods.length === 0 ? <EmptyState icon={Puzzle} title="No mods">This server runs vanilla.</EmptyState> : (
          <div className="divide-y divide-ink-700/70">
            {mods.map((m, i) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="num w-6 text-xs text-ink-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Input className="h-8 border-transparent bg-transparent px-1 py-1 hover:border-ink-600" value={m.name} placeholder="(unnamed mod)"
                    onChange={(e) => setMods(mods.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} />
                  <a href={link(m.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1 font-mono text-xs text-ink-400 hover:text-brand-300">{m.id}<ExternalLink className="size-3" /></a>
                </div>
                <Toggle checked={m.enabled !== false} label="" onChange={(v) => setMods(mods.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)))} />
                <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === mods.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                <Button size="icon" variant="danger-ghost" aria-label="Remove" onClick={() => setMods(mods.filter((x) => x.id !== m.id))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button variant="primary" size="lg" icon={Save} disabled={!dirty} loading={saving} onClick={save} className="shadow-xl shadow-black/40">Save mods</Button>
      </div>
    </div>
  );
}
