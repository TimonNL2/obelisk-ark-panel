import { useEffect, useState } from 'react';
import { AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { ExternalLink, GripVertical, Plus, Puzzle, Trash2 } from 'lucide-react';
import { put } from '../../lib/api.js';
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, SaveBar, Switch, cx, spring, useToast } from '../../components/ui.jsx';

function ModRow({ mod, index, link, onChange, onRemove }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={mod} dragListener={false} dragControls={controls} transition={spring}
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      whileDrag={{ scale: 1.015, boxShadow: '0 18px 40px rgb(0 0 0 / 0.45)', zIndex: 10 }}
      className={cx('surface relative flex items-center gap-3 rounded-xl border border-ink-700/80 px-3 py-2.5', mod.enabled === false && 'opacity-60')}>
      <button type="button" aria-label="Drag to reorder" onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none rounded-md p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100 active:cursor-grabbing">
        <GripVertical className="size-4" />
      </button>
      <span className="num w-5 text-center font-display text-sm text-ink-400">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <input className="w-full rounded-md bg-transparent px-1 py-0.5 text-sm text-ink-100 outline-none transition-colors placeholder:text-ink-500 hover:bg-ink-800 focus:bg-ink-900"
          value={mod.name} placeholder="Unnamed mod" onChange={(e) => onChange({ ...mod, name: e.target.value })} aria-label="Mod name" />
        <a href={link(mod.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1 text-xs text-ink-400 hover:text-brand-300">{mod.id}<ExternalLink className="size-3" /></a>
      </div>
      <Switch checked={mod.enabled !== false} label={`Enable ${mod.name || mod.id}`} onChange={(v) => onChange({ ...mod, enabled: v })} />
      <Button size="icon" variant="danger-ghost" aria-label="Remove mod" onClick={onRemove}><Trash2 className="size-4" /></Button>
    </Reorder.Item>
  );
}

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
    if (bad.length) { toast.error(`Mod IDs contain only digits (check ${bad.join(', ')})`); return; }
    const fresh = ids.filter((id) => !mods.some((m) => m.id === id)).map((id) => ({ id, name: ids.length === 1 ? newName.trim() : '', enabled: true }));
    setMods([...mods, ...fresh]);
    setNewId('');
    setNewName('');
  };

  const save = async () => {
    setSaving(true);
    try {
      await put(`/servers/${server.id}`, { mods });
      toast.success(running ? 'Mods saved, restart the server to load them' : 'Mods saved');
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
          ? 'ASA mods come from CurseForge: copy the Project ID from the mod page. The server downloads and updates them by itself when it starts.'
          : 'ASE mods come from the Steam Workshop: use the number at the end of the workshop link. They are downloaded when the server starts.'}
        {' '}Drag mods to change the load order.
      </Alert>

      <Card>
        <CardHeader icon={Plus} title="Add a mod" />
        <form onSubmit={add} className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={isAsa ? 'CurseForge project ID' : 'Workshop ID'} hint="Add several at once by separating them with commas.">
            <Input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder={isAsa ? '928988' : '731604991'} />
          </Field>
          <Field label="Name" hint="Optional, just for you.">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Structures Plus" />
          </Field>
          <Button type="submit" icon={Plus} disabled={!newId.trim()} className="sm:mb-6">Add</Button>
        </form>
      </Card>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[17px] font-semibold"><Puzzle className="size-4 text-ink-400" />Load order <span className="text-sm font-normal text-ink-400">{mods.filter((m) => m.enabled !== false).length} active</span></h3>
        {mods.length === 0 ? <Card><EmptyState icon={Puzzle} title="No mods">This server runs the unmodded game.</EmptyState></Card> : (
          <Reorder.Group axis="y" values={mods} onReorder={setMods} className="space-y-2">
            <AnimatePresence initial={false}>
              {mods.map((m, i) => (
                <ModRow key={m.id} mod={m} index={i} link={link}
                  onChange={(next) => setMods(mods.map((x) => (x.id === m.id ? next : x)))}
                  onRemove={() => setMods(mods.filter((x) => x.id !== m.id))} />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>

      <SaveBar show={dirty} saving={saving} onSave={save} onDiscard={() => setMods(server.mods || [])} label="Save mods" />
    </div>
  );
}
