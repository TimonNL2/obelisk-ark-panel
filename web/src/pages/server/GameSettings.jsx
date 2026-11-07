import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { get, put } from '../../lib/api.js';
import { Alert, Button, Card, Input, Loading, Menu, SaveBar, cx, spring, useConfirm, useToast } from '../../components/ui.jsx';
import { CopySettingsModal } from '../../components/ServerToolsModals.jsx';

const keyOf = (d) => `${d.file}|${d.section}|${d.key}`;
const STATS_CAT = 'Stats per level';

function toForm(d) {
  const v = {};
  for (const def of d.catalog) {
    const o = d.overrides?.[def.file]?.[def.section]?.[def.key];
    if (o !== undefined) v[keyOf(def)] = def.type === 'bool' ? (/^true$/i.test(o) ? 'true' : 'false') : o;
  }
  return v;
}

/** Three-way switch: game default / on / off. */
function TriState({ value, onChange, fileVal }) {
  const id = useId();
  const opts = [['', 'Default'], ['true', 'On'], ['false', 'Off']];
  return (
    <div className="relative flex rounded-[10px] border border-ink-600 bg-ink-900 p-0.5" role="radiogroup">
      {opts.map(([v, label]) => (
        <button key={label} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          title={v === '' && fileVal !== undefined ? `Currently ${fileVal} in the file` : undefined}
          className={cx('relative z-10 min-w-12 rounded-lg px-2 py-1 text-xs font-medium transition-colors', value === v ? (v === 'false' ? 'text-red-200' : v === 'true' ? 'text-ink-950' : 'text-ink-100') : 'text-ink-400 hover:text-ink-200')}>
          {value === v && (
            <motion.span layoutId={`tri-${id}`} transition={spring}
              className={cx('absolute inset-0 -z-10 rounded-lg', v === 'true' ? 'bg-brand-400' : v === 'false' ? 'bg-red-500/25' : 'bg-ink-700')} />
          )}
          {label}
        </button>
      ))}
    </div>
  );
}

function SettingRow({ def, value, fileVal, onChange }) {
  const custom = value !== '' && value !== undefined;
  return (
    <motion.div layout="position" className={cx('relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl px-3 py-3 transition-colors', custom ? 'bg-brand-400/[0.05]' : 'hover:bg-ink-800/50')}>
      <AnimatePresence>
        {custom && <motion.span initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }} transition={spring} className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-400" />}
      </AnimatePresence>
      <div className="min-w-0 flex-1 basis-60">
        <div className={cx('text-sm transition-colors', custom ? 'text-brand-300' : 'text-ink-100')}>{def.label}</div>
        <div className="mt-0.5 text-xs text-ink-400">
          {def.help ? `${def.help} ` : ''}<span className="text-ink-500" title={`${def.file} [${def.section}]`}>{def.key}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {def.type === 'bool' ? (
          <TriState value={value ?? ''} fileVal={fileVal} onChange={onChange} />
        ) : (
          <Input type="number" step="any" inputMode="decimal" className="h-9 w-32 py-1.5 text-right font-display text-[15px]" value={value ?? ''}
            placeholder={fileVal ?? def.placeholder ?? 'default'} onChange={(e) => onChange(e.target.value)} aria-label={def.label} />
        )}
        <button type="button" title="Back to default" aria-label={`Reset ${def.label}`} onClick={() => onChange('')}
          className={cx('rounded-lg p-1.5 text-ink-400 transition-all hover:bg-ink-700 hover:text-ink-100', custom ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function StatsMatrix({ defs, stats, values, setValue, current }) {
  const byKey = new Map(defs.map((d) => [`${d.matrix.group}|${d.matrix.stat}`, d]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-400">
            <th className="px-3 py-2 font-medium">Stat</th>
            {stats.groups.map((g) => <th key={g.prefix} className="px-2 py-2 text-right font-medium">{g.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {stats.names.map((name, i) => (
            <tr key={name} className="border-t border-ink-700/50">
              <td className="px-3 py-1.5 text-ink-200">{name}</td>
              {stats.groups.map((g) => {
                const def = byKey.get(`${g.prefix}|${i}`);
                const k = keyOf(def);
                const v = values[k] ?? '';
                return (
                  <td key={g.prefix} className="px-1.5 py-1.5">
                    <Input type="number" step="any" aria-label={def.label} value={v}
                      placeholder={current?.[def.file]?.[def.section]?.[def.key] ?? '1'}
                      onChange={(e) => setValue(k, e.target.value)}
                      className={cx('h-8 py-1 text-right font-display', v !== '' && 'border-brand-500/60 bg-brand-400/[0.06] text-brand-200')} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 px-3 text-xs text-ink-400">Multiplies how much a stat grows per level point. “On tame” and “affinity” control the bonus a dino gets when it is tamed.</p>
    </div>
  );
}

export default function GameSettings({ server }) {
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [initial, setInitial] = useState({});
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const sections = useRef({});
  const running = ['running', 'starting'].includes(server.runtime.state);

  const load = async () => {
    const d = await get(`/servers/${server.id}/game-settings`);
    const v = toForm(d);
    setData(d);
    setValues(v);
    setInitial(v);
  };
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [server.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => (data ? [...new Set(data.catalog.map((d) => d.category))] : []), [data]);
  const filtered = useMemo(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase();
    return data.catalog.filter((d) => !s || `${d.label} ${d.key} ${d.help} ${d.category}`.toLowerCase().includes(s));
  }, [data, search]);

  useEffect(() => { if (categories.length && !active) setActive(categories[0]); }, [categories, active]);

  // On desktop the settings live in their own scroll box that fills the rest of the window,
  // so clicking a category scrolls only that box instead of jumping the whole page.
  const grid = useRef(null);
  const scroller = useRef(null);
  const autoScrolling = useRef(false);
  const [boxHeight, setBoxHeight] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = grid.current;
      const main = el?.closest('main');
      if (!el || !main || window.innerWidth < 1024) { setBoxHeight(null); return; }
      const offset = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      setBoxHeight(Math.max(420, main.clientHeight - offset - 40));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [data]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [search]);

  // Highlight the category you are looking at while scrolling the box
  const onBoxScroll = () => {
    const box = scroller.current;
    if (!box || autoScrolling.current || search) return;
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
    let current = null;
    for (const cat of categories) {
      const sec = sections.current[cat];
      if (sec && sec.offsetTop - 24 <= box.scrollTop) current = cat;
    }
    if (atBottom) current = categories[categories.length - 1];
    if (current && current !== active) setActive(current);
  };

  if (!data) return <Loading rows={4} />;

  const setValue = (k, v) => setValues((prev) => {
    const n = { ...prev };
    if (v === '' || v === undefined) delete n[k]; else n[k] = String(v);
    return n;
  });
  const changes = [...new Set([...Object.keys(values), ...Object.keys(initial)])].filter((k) => values[k] !== initial[k]).length;
  const customIn = (cat) => data.catalog.filter((d) => d.category === cat && values[keyOf(d)] !== undefined).length;

  const applyPreset = async (p) => {
    const ok = await confirm({ title: `Apply “${p.label}”?`, message: `${p.description} The values are filled in; review them and click save.`, confirmLabel: 'Fill in values' });
    if (!ok) return;
    setValues((prev) => {
      const n = { ...prev };
      if (p.clear) for (const d of data.catalog) if (p.clear.includes(d.category)) delete n[keyOf(d)];
      for (const [key, val] of Object.entries(p.values)) {
        const def = data.catalog.find((d) => d.key === key);
        if (def) n[keyOf(def)] = def.type === 'bool' ? String(!!val) : String(val);
      }
      return n;
    });
  };

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
      toast.success(res.appliedNow ? 'Game settings saved to the config files' : 'Game settings saved, they apply on the next restart');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const jump = (cat) => {
    setActive(cat);
    setSearch('');
    requestAnimationFrame(() => {
      const sec = sections.current[cat];
      const box = scroller.current;
      if (!sec) return;
      if (box && boxHeight) {
        autoScrolling.current = true;
        box.scrollTo({ top: sec.offsetTop - 4, behavior: 'smooth' });
        clearTimeout(jump.t);
        jump.t = setTimeout(() => { autoScrolling.current = false; }, 700);
      } else {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const shownCats = categories.filter((c) => filtered.some((d) => d.category === c));
  const totalCustom = Object.keys(values).length;

  return (
    <div className="space-y-5">
      <Alert type="info">
        Empty values use the game default. Obelisk writes these into GameUserSettings.ini and Game.ini every time the server starts, so ARK can't overwrite them.
        {running && ' The server is running: changes apply after a restart.'}
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input className="pl-9 pr-9" placeholder={`Search ${data.catalog.length} settings`} value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-100"><X className="size-3.5" /></button>}
        </div>
        <Menu align="right" width="w-72"
          trigger={({ toggle }) => <Button icon={Sparkles} onClick={toggle}>Presets</Button>}
          items={data.presets.map((p) => ({ label: p.label, onClick: () => applyPreset(p) }))} />
        <Button icon={Copy} onClick={() => setCopyOpen(true)} title="Copy these game settings to other servers or the whole cluster">Copy to servers</Button>
        {totalCustom > 0 && (
          <Button variant="ghost" icon={RotateCcw} onClick={async () => {
            if (await confirm({ title: 'Reset every setting to the game default?', message: 'This clears all values on this page. Nothing is saved until you click save.', danger: true, confirmLabel: 'Clear all' })) setValues({});
          }}>Clear all</Button>
        )}
      </div>

      <div ref={grid} className="grid gap-5 lg:grid-cols-[220px_1fr]" style={boxHeight ? { height: boxHeight } : undefined}>
        <nav className="hidden min-h-0 overflow-y-auto lg:block" aria-label="Setting categories">
          <div className="space-y-0.5">
            {categories.map((c) => {
              const n = customIn(c);
              const isActive = active === c && !search;
              return (
                <button key={c} type="button" onClick={() => jump(c)}
                  className={cx('relative flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-sm transition-colors', isActive ? 'text-ink-100' : 'text-ink-300 hover:text-ink-100')}>
                  {isActive && <motion.span layoutId={`gs-cat-${server.id}`} transition={spring} className="absolute inset-0 rounded-[10px] bg-ink-700/70" />}
                  <span className="relative">{c}</span>
                  <AnimatePresence>
                    {n > 0 && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}
                        className="num relative rounded-full bg-brand-400/15 px-1.5 text-[11px] font-semibold text-brand-300">{n}</motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        </nav>

        <div ref={scroller} onScroll={onBoxScroll}
          className={cx('relative min-w-0 space-y-5', boxHeight && 'min-h-0 overflow-y-auto overscroll-contain rounded-[14px] pr-1.5 pb-24')}>
          {shownCats.length === 0 && <Card className="px-5 py-12 text-center text-sm text-ink-400">No setting matches “{search}”.</Card>}
          {shownCats.map((cat) => {
            const defs = filtered.filter((d) => d.category === cat);
            return (
              <section key={cat} ref={(el) => { sections.current[cat] = el; }} className="scroll-mt-4" data-category={cat}>
                <Card>
                  <div className="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
                    <h3 className="text-[17px] font-semibold">{cat}</h3>
                    <span className="text-xs text-ink-400">{defs.length} settings</span>
                  </div>
                  <div className="p-2">
                    {cat === STATS_CAT && !search ? (
                      <StatsMatrix defs={defs} stats={data.stats} values={values} setValue={setValue} current={data.current} />
                    ) : (
                      <div className="grid gap-x-2 xl:grid-cols-2">
                        {defs.map((def) => (
                          <SettingRow key={keyOf(def)} def={def} value={values[keyOf(def)] ?? ''}
                            fileVal={data.current?.[def.file]?.[def.section]?.[def.key]}
                            onChange={(v) => setValue(keyOf(def), v)} />
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </section>
            );
          })}
        </div>
      </div>

      <SaveBar show={changes > 0} count={changes} saving={saving} onSave={save} onDiscard={() => setValues(initial)} label="Save game settings" />
      <CopySettingsModal open={copyOpen} onClose={() => setCopyOpen(false)} server={server} defaultParts={['game']} dirtyWarning={changes > 0} />
    </div>
  );
}
