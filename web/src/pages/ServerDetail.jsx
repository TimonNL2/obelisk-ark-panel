import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft, LayoutGrid, Terminal, Users, SlidersHorizontal, Gauge, FileCode2, Puzzle, FolderOpen, Archive, CalendarClock,
  MoreVertical, ArrowUpCircle, ShieldCheck, Skull, Download, Copy as CopyIcon, CopyPlus,
} from 'lucide-react';
import { get, post } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { Alert, Badge, CopyButton, GameBadge, Loading, Menu, StatusBadge, Tabs, easeOut, stateInfo, useAction, useConfirm } from '../components/ui.jsx';
import { PowerButtons } from '../components/ServerBits.jsx';
import { useServers } from '../components/Layout.jsx';
import Obelisk from '../components/Obelisk.jsx';
import ConsoleView from '../components/ConsoleView.jsx';
import FileManager from '../components/FileManager.jsx';
import BackupsPanel from '../components/BackupsPanel.jsx';
import SchedulesPanel from '../components/SchedulesPanel.jsx';
import { CloneServerModal, CopySettingsModal } from '../components/ServerToolsModals.jsx';
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

function MoreMenu({ server, onDone, onClone, onCopy }) {
  const [, run] = useAction();
  const confirm = useConfirm();
  const alive = ['running', 'starting'].includes(server.runtime.state) || server.runtime.processes > 0;
  const after = (p) => p.then(onDone);
  const items = [
    server.installed && {
      label: 'Update game', icon: ArrowUpCircle, onClick: async () => {
        let warnMinutes = 0;
        if (alive) {
          const res = await confirm({ title: 'Update the server?', message: 'The server stops, updates through SteamCMD and starts again.', confirmLabel: 'Update in 5 minutes', checkbox: 'Update right now, without a warning' });
          if (!res) return;
          warnMinutes = res.checked ? 0 : 5;
        }
        after(run('update', () => post(`/servers/${server.id}/update`, { warnMinutes }), 'Update started'));
      },
    },
    server.installed && !alive && { label: 'Validate game files', icon: ShieldCheck, onClick: () => after(run('validate', () => post(`/servers/${server.id}/install`, { validate: true }), 'Validation started')) },
    !server.installed && { label: 'Install game files', icon: Download, onClick: () => after(run('install', () => post(`/servers/${server.id}/install`), 'Installation started')) },
    { label: 'Copy settings to other servers', icon: CopyIcon, onClick: onCopy },
    { label: 'Clone server', icon: CopyPlus, onClick: onClone },
    alive && {
      label: 'Force kill', icon: Skull, danger: true, onClick: async () => {
        if (await confirm({ title: 'Force kill the server?', message: 'The process is killed immediately, without saving the world. Only use this when the server is stuck.', danger: true, confirmLabel: 'Kill' })) {
          after(run('kill', () => post(`/servers/${server.id}/kill`), 'Server killed'));
        }
      },
    },
  ];
  return (
    <Menu items={items} trigger={({ toggle }) => (
      <button type="button" aria-label="More actions" onClick={toggle} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-ink-600/80 bg-ink-700/80 text-ink-200 transition-colors hover:bg-ink-600"><MoreVertical className="size-4" /></button>
    )} />
  );
}

export default function ServerDetail() {
  const { id, tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const { reload: reloadAll } = useServers();
  const { data: server, error, reload } = usePoll(() => get(`/servers/${id}`), 2000, [id]);
  const [dialog, setDialog] = useState(null);

  if (error?.status === 404) {
    return <Alert type="error" title="Server not found">It may have been deleted. <Link className="underline" to="/servers">Back to servers</Link></Alert>;
  }
  if (!server) return <Loading rows={4} />;

  const refresh = () => { reload(); reloadAll(); };
  const r = server.runtime;

  return (
    <>
      <Link to="/servers" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-400 transition-colors hover:text-ink-100"><ArrowLeft className="size-4" />Servers</Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 items-end gap-4">
          <Obelisk info={stateInfo(server)} height={72} width={22} />
          <div className="min-w-0 pb-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-[30px] font-semibold leading-none">{server.name}</h1>
              <GameBadge game={server.game} />
              {server.cluster && <Link to={`/clusters/${server.cluster.id}`}><Badge color="blue">{server.cluster.name}</Badge></Link>}
              {server.updateAvailable && <Badge color="yellow">Update available</Badge>}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-300">
              <StatusBadge server={server} />
              <span>{server.mapName}</span>
              {server.connect && (
                <span className="flex items-center gap-1">Connect <span className="num font-display font-semibold text-ink-100">{server.connect}</span><CopyButton value={server.connect} /></span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PowerButtons server={server} onDone={refresh} />
          <MoreMenu server={server} onDone={refresh} onClone={() => setDialog('clone')} onCopy={() => setDialog('copy')} />
        </div>
      </div>

      {r.countdown && (
        <Alert type="warning" className="mb-4" title={`Countdown running, the server is ${r.countdown.verb}`}>
          Players are being warned. It finishes around {new Date(r.countdown.endsAt).toLocaleTimeString()}.
        </Alert>
      )}
      {r.lastError && !r.job && r.state !== 'running' && (
        <Alert type="error" className="mb-4" title="The last action failed">{r.lastError}</Alert>
      )}

      <Tabs tabs={TABS} active={tab} onChange={(t) => navigate(`/servers/${id}/${t === 'overview' ? '' : t}`)} />

      <motion.div key={tab} className="mt-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: easeOut }}>
        {tab === 'overview' && <Overview server={server} />}
        {tab === 'console' && <ConsoleView server={server} />}
        {tab === 'players' && <Players server={server} />}
        {tab === 'settings' && <StartupSettings server={server} onSaved={refresh} />}
        {tab === 'game' && <GameSettings server={server} />}
        {tab === 'config' && <ConfigFiles server={server} />}
        {tab === 'mods' && <Mods server={server} onSaved={refresh} />}
        {tab === 'files' && (
          <FileManager rootType="server" rootId={server.id}
            warning={r.state === 'running' ? <Alert type="info">The server is running. The game can overwrite save files and configs you edit now.</Alert> : null} />
        )}
        {tab === 'backups' && <BackupsPanel kind="servers" id={server.id} restoreHint="Stop the server first" />}
        {tab === 'schedules' && <SchedulesPanel targetType="server" targetId={server.id} />}
      </motion.div>
      <CopySettingsModal open={dialog === 'copy'} onClose={() => setDialog(null)} server={server} defaultParts={['game', 'mods']} />
      <CloneServerModal open={dialog === 'clone'} onClose={() => setDialog(null)} server={server} />
    </>
  );
}
