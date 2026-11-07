import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CornerDownLeft, LayoutDashboard, Network, Search, Server, Settings, Plus, Terminal, FolderOpen, Gauge } from 'lucide-react';
import { StatusDot, cx, spring } from './ui.jsx';

/** Ctrl/Cmd + K: jump to any server, cluster or page. */
export default function CommandPalette({ servers = [], clusters = [], onNewServer }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('obelisk:palette', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('obelisk:palette', onOpen); };
  }, []);
  useEffect(() => { if (open) { setQuery(''); setIndex(0); } }, [open]);

  const items = useMemo(() => {
    const all = [
      { id: 'p-dash', label: 'Dashboard', hint: 'Page', icon: LayoutDashboard, go: '/' },
      { id: 'p-servers', label: 'Servers', hint: 'Page', icon: Server, go: '/servers' },
      { id: 'p-clusters', label: 'Clusters', hint: 'Page', icon: Network, go: '/clusters' },
      { id: 'p-settings', label: 'Settings', hint: 'Page', icon: Settings, go: '/settings' },
      { id: 'a-new', label: 'Create a new server', hint: 'Action', icon: Plus, run: onNewServer },
      ...servers.flatMap((s) => [
        { id: `s-${s.id}`, label: s.name, hint: `${s.gameShort} server on ${s.mapName}`, server: s, go: `/servers/${s.id}` },
        { id: `s-${s.id}-c`, label: `${s.name}: console`, hint: 'Console', icon: Terminal, go: `/servers/${s.id}/console`, sub: true },
        { id: `s-${s.id}-g`, label: `${s.name}: game settings`, hint: 'Game settings', icon: Gauge, go: `/servers/${s.id}/game`, sub: true },
        { id: `s-${s.id}-f`, label: `${s.name}: files`, hint: 'Files', icon: FolderOpen, go: `/servers/${s.id}/files`, sub: true },
      ]),
      ...clusters.map((c) => ({ id: `c-${c.id}`, label: c.name, hint: `Cluster with ${c.servers.length} servers`, icon: Network, go: `/clusters/${c.id}` })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all.filter((i) => !i.sub);
    return all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)).slice(0, 30);
  }, [servers, clusters, query, onNewServer]);

  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const choose = (item) => {
    setOpen(false);
    if (item.run) item.run();
    else navigate(item.go);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && items[index]) { e.preventDefault(); choose(items[index]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[14vh] backdrop-blur-[3px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
            transition={spring}
            className="surface w-full max-w-xl overflow-hidden rounded-2xl border border-ink-600 shadow-2xl shadow-black/60" role="dialog" aria-label="Command palette">
            <div className="flex items-center gap-3 border-b border-ink-700 px-4">
              <Search className="size-4 text-ink-400" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
                placeholder="Jump to a server, cluster or page..." className="h-14 flex-1 bg-transparent text-[15px] text-ink-100 outline-none placeholder:text-ink-400" />
              <kbd className="rounded-md border border-ink-600 px-1.5 py-0.5 text-[10px] text-ink-400">Esc</kbd>
            </div>
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
              {items.length === 0 && <div className="px-3 py-8 text-center text-sm text-ink-400">Nothing matches “{query}”.</div>}
              {items.map((item, i) => (
                <button key={item.id} type="button" data-index={i} onMouseMove={() => setIndex(i)} onClick={() => choose(item)}
                  className={cx('relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', i === index ? 'text-ink-100' : 'text-ink-200')}>
                  {i === index && <motion.span layoutId="palette-hl" transition={spring} className="absolute inset-0 rounded-xl bg-ink-700/80" />}
                  <span className="relative flex size-7 items-center justify-center rounded-lg bg-ink-800">
                    {item.server ? <StatusDot server={item.server} /> : <item.icon className="size-4 text-ink-300" />}
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-ink-400">{item.hint}</span>
                  </span>
                  {i === index && <CornerDownLeft className="relative size-3.5 text-ink-400" />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
