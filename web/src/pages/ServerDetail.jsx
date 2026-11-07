import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, LayoutGrid, Terminal, Users, SlidersHorizontal, Gauge, FileCode2, Puzzle, FolderOpen, Archive, CalendarClock,
  MoreVertical, ArrowUpCircle, ShieldCheck, Skull, Download,
} from 'lucide-react';
import { get, post } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { Alert, Badge, CopyButton, GameBadge, Loading, StatusBadge, Tabs, cx, useAction, useConfirm } from '../components/ui.jsx';
import { PowerButtons } from '../components/ServerBits.jsx';
import { useServers } from '../components/Layout.jsx';
import ConsoleView from '../components/ConsoleView.jsx';
import FileManager from '../components/FileManager.jsx';
import BackupsPanel from '../components/BackupsPanel.jsx';
import SchedulesPanel from '../components/SchedulesPanel.jsx';
import Overview from './server/Overview.jsx';
import Players from './server/Players.jsx';
import StartupSettings from './server/StartupSettings.jsx';
import GameSettings from './server/GameSettings.jsx';
import ConfigFiles from './server/ConfigFiles.jsx';
import Mods from './server/Mods.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'console', label: 'Console', icon: Terminal },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'settings', label: 'Server settings', icon: SlidersHorizontal },
  { id: 'game', label: 'Game settings', icon: Gauge },
  { id: 'config', label: 'Config files', icon: FileCode2 },
  { id: 'mods', label: 'Mods', icon: Puzzle },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'schedules', label: 'Schedules', icon: CalendarClock },
];

function MoreMenu({ server, onDone }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [, run] = useAction();
  const confirm = useConfirm();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const alive = ['running', 'starting'].includes(server.runtime.state) || server.runtime.processes > 0;
  const items = [
    server.installed && {
      label: 'Update game', icon: ArrowUpCircle, fn: async () => {
        let warnMinutes = 0;
        if (alive) {
          const res = await confirm({ title: 'Update the server?', message: 'The server is stopped, updated through SteamCMD and started again.', confirmLabel: 'Update with 5 min warning', checkbox: 'Update right now (no warning)' });
          if (!res) return;
          warnMinutes = res.checked ? 0 : 5;
        }
        run('update', () => post(`/servers/${server.id}/update`, { warnMinutes }), 'Update started');
      },
    },
    server.installed && !alive && { label: 'Validate game files', icon: ShieldCheck, fn: () => run('validate', () => post(`/servers/${server.id}/install`, { validate: true }), 'Validation started') },
    !server.installed && { label: 'Install game files', icon: Download, fn: () => run('install', () => post(`/servers/${server.id}/install`), 'Installation started') },
    alive && {
      label: 'Force kill', icon: Skull, danger: true, fn: async () => {
        if (await confirm({ title: 'Force kill the server?', message: 'The process is killed immediately WITHOUT saving the world. Use this only when the server is stuck.', danger: true, confirmLabel: 'Kill' })) run('kill', () => post(`/servers/${server.id}/kill`), 'Server killed');
      },
    },
  ].filter(Boolean);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="More actions" onClick={() => setOpen(!open)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 bg-ink-700 text-ink-200 hover:bg-ink-600"><MoreVertical className="size-4" /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 py-1 shadow-xl shadow-black/40">
          {items.map((it) => (
            <button key={it.label} type="button" onClick={() => { setOpen(false); it.fn().then?.(onDone); }}
              className={cx('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-ink-700', it.danger ? 'text-red-300' : 'text-ink-100')}>
              <it.icon className="size-4" />{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ServerDetail() {
  const { id, tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const { reload: reloadAll } = useServers();
  const { data: server, error, reload } = usePoll(() => get(`/servers/${id}`), 2000, [id]);

  if (error?.status === 404) {
    return <Alert type="error" title="Server not found">It may have been deleted. <Link className="underline" to="/servers">Back to servers</Link></Alert>;
  }
  if (!server) return <Loading />;

  const refresh = () => { reload(); reloadAll(); };
  const r = server.runtime;

  return (
    <>
      <Link to="/servers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100"><ArrowLeft className="size-4" />Servers</Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{server.name}</h1>
            <GameBadge game={server.game} />
            {server.cluster && <Link to={`/clusters/${server.cluster.id}`}><Badge color="blue">{server.cluster.name}</Badge></Link>}
            {server.updateAvailable && <Badge color="yellow">Update available</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-300">
            <StatusBadge server={server} />
            <span>{server.mapName}</span>
            {server.connect && (
              <span className="flex items-center gap-1">Connect: <span className="num font-mono text-ink-100">{server.connect}</span><CopyButton value={server.connect} /></span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PowerButtons server={server} onDone={refresh} />
          <MoreMenu server={server} onDone={refresh} />
        </div>
      </div>

      {r.countdown && (
        <Alert type="warning" className="mb-4" title={`Countdown running: server ${r.countdown.verb}`}>
          Players are being warned. Finishes around {new Date(r.countdown.endsAt).toLocaleTimeString()}.
        </Alert>
      )}
      {r.lastError && !r.job && r.state !== 'running' && (
        <Alert type="error" className="mb-4" title="Last action failed">{r.lastError}</Alert>
      )}

      <Tabs tabs={TABS} active={tab} onChange={(t) => navigate(`/servers/${id}/${t === 'overview' ? '' : t}`)} />

      <div className="mt-5">
        {tab === 'overview' && <Overview server={server} />}
        {tab === 'console' && <ConsoleView server={server} />}
        {tab === 'players' && <Players server={server} />}
        {tab === 'settings' && <StartupSettings server={server} onSaved={refresh} />}
        {tab === 'game' && <GameSettings server={server} />}
        {tab === 'config' && <ConfigFiles server={server} />}
        {tab === 'mods' && <Mods server={server} onSaved={refresh} />}
        {tab === 'files' && (
          <FileManager rootType="server" rootId={server.id}
            warning={r.state === 'running' ? <Alert type="info">The server is running. Editing save files or configs while it runs can be overwritten by the game.</Alert> : null} />
        )}
        {tab === 'backups' && <BackupsPanel kind="servers" id={server.id} restoreHint="Stop the server first" />}
        {tab === 'schedules' && <SchedulesPanel targetType="server" targetId={server.id} />}
      </div>
    </>
  );
}
