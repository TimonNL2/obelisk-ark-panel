import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Send, Trash2, Wifi, WifiOff } from 'lucide-react';
import { consoleSocket } from '../lib/socket.js';
import { post } from '../lib/api.js';
import { Button, cx, useToast } from './ui.jsx';

const MAX = 2000;

function lineClass(l) {
  const m = l.m;
  if (/\b(error|failed|fatal|exception|crash)/i.test(m)) return 'text-red-300';
  if (/\bwarn(ing)?\b/i.test(m)) return 'text-ember-400';
  if (m.includes('[RCON]')) return m.includes('] > ') ? 'text-brand-300' : 'text-ink-100';
  if (m.includes('[SteamCMD]') || m.includes('[rsync]') || m.includes('[Proton]')) return 'text-sky-300/90';
  if (m.includes('[Panel]') || m.includes('[Backup]') || m.includes('[Schedule]')) return 'text-brand-300/90';
  if (l.s === 'game') return 'text-ink-200';
  return 'text-ink-300';
}

const QUICK = [
  { label: 'Save world', cmd: 'SaveWorld' },
  { label: 'List players', cmd: 'ListPlayers' },
  { label: 'Get chat', cmd: 'GetChat' },
];

export default function ConsoleView({ server, height = 'h-[60vh]', compact = false }) {
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('all');
  const [follow, setFollow] = useState(true);
  const history = useRef([]);
  const histPos = useRef(-1);
  const box = useRef(null);
  const toast = useToast();
  const alive = ['running', 'starting'].includes(server.runtime.state);

  useEffect(() => consoleSocket.onStatus(setConnected), []);
  useEffect(() => {
    setLines([]);
    return consoleSocket.subscribe(server.id, (msg) => {
      if (msg.type === 'history') setLines(msg.lines.slice(-MAX));
      else if (msg.type === 'lines') setLines((prev) => { const next = prev.concat(msg.lines); return next.length > MAX ? next.slice(-MAX) : next; });
      else if (msg.type === 'error') toast.error(msg.message);
    });
  }, [server.id, toast]);

  const shown = useMemo(() => lines.filter((l) => filter === 'all' || (filter === 'game' ? l.s === 'game' : l.s !== 'game')), [lines, filter]);

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [shown, follow]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom !== follow) setFollow(atBottom);
  };

  const send = (cmd) => {
    const c = (cmd ?? input).trim();
    if (!c) return;
    if (!alive) { toast.error('The server is not running'); return; }
    consoleSocket.command(server.id, c);
    history.current = [c, ...history.current.filter((h) => h !== c)].slice(0, 50);
    histPos.current = -1;
    if (cmd === undefined) setInput('');
    setFollow(true);
  };

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); send(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      histPos.current = Math.min(history.current.length - 1, histPos.current + 1);
      if (history.current[histPos.current] !== undefined) setInput(history.current[histPos.current]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      histPos.current = Math.max(-1, histPos.current - 1);
      setInput(histPos.current === -1 ? '' : history.current[histPos.current]);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 bg-ink-900 px-3 py-2">
          <div className="flex items-center gap-1">
            {[['all', 'All'], ['game', 'Game log'], ['panel', 'Panel & SteamCMD']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)}
                className={cx('rounded-md px-2.5 py-1 text-xs', filter === id ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:text-ink-100')}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className={cx('flex items-center gap-1.5 text-xs', connected ? 'text-emerald-300' : 'text-ink-400')}>
              {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}{connected ? 'Live' : 'Connecting...'}
            </span>
            <Button size="icon" variant="ghost" title="Clear view" aria-label="Clear view" onClick={async () => { setLines([]); await post(`/servers/${server.id}/console/clear`).catch(() => {}); }}><Trash2 className="size-4" /></Button>
          </div>
        </div>
      )}
      <div className="relative">
        <div ref={box} onScroll={onScroll} className={cx('overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed', height)}>
          {shown.length === 0 ? (
            <div className="text-ink-400">No output yet. Start the server or install it to see output here.</div>
          ) : shown.map((l, i) => (
            <div key={i} className={cx('console-line', lineClass(l))}>{l.m}</div>
          ))}
        </div>
        {!follow && (
          <button type="button" onClick={() => setFollow(true)} className="absolute bottom-3 right-4 flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-800/95 px-3 py-1.5 text-xs text-ink-100 shadow-lg hover:bg-ink-700">
            <ArrowDown className="size-3.5" />Jump to latest
          </button>
        )}
      </div>
      <div className="border-t border-ink-700 bg-ink-900 p-2">
        {!compact && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q.cmd} type="button" disabled={!alive} onClick={() => send(q.cmd)}
                className="rounded-md border border-ink-600 px-2 py-1 text-xs text-ink-200 hover:bg-ink-700 disabled:opacity-40">{q.label}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="pl-2 font-mono text-sm text-brand-400">&gt;</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={!alive}
            placeholder={alive ? 'Type an RCON command (e.g. Broadcast Hello, DestroyWildDinos, SetTimeOfDay 12:00)' : 'Server is offline'}
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-sm text-ink-100 outline-none placeholder:text-ink-400 disabled:opacity-50"
            spellCheck={false}
            autoComplete="off"
          />
          <Button size="sm" variant="primary" icon={Send} disabled={!alive || !input.trim()} onClick={() => send()}>Send</Button>
        </div>
      </div>
    </div>
  );
}
