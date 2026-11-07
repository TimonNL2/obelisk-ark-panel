import { Link } from 'react-router-dom';
import { Play, Square, RotateCw, Download, Users, Cpu, MemoryStick, ArrowUpCircle } from 'lucide-react';
import { post } from '../lib/api.js';
import { bytes, pct } from '../lib/format.js';
import { Button, Card, GameBadge, ProgressBar, StatusBadge, cx, useAction, useConfirm } from './ui.jsx';
import { useServers } from './Layout.jsx';

/** Start / stop / restart buttons that adapt to the current state. */
export function PowerButtons({ server, size = 'md', onDone, showLabels = true }) {
  const [busy, run] = useAction();
  const confirm = useConfirm();
  const { reload } = useServers();
  const state = server.runtime.state;
  const job = server.runtime.job;
  const alive = ['running', 'starting'].includes(state);
  const done = () => { reload(); onDone?.(); };

  const act = (action, label) => run(action, async () => {
    let body = {};
    if ((action === 'stop' || action === 'restart') && state === 'running' && server.runtime.playerCount > 0) {
      const res = await confirm({
        title: `${label} "${server.name}"?`,
        message: `${server.runtime.playerCount} player(s) are online. You can give them a warning first.`,
        confirmLabel: `${label} with 5 min warning`,
        checkbox: `${label} right now (no warning)`,
      });
      if (!res) return;
      body = { warnMinutes: res.checked ? 0 : 5 };
    }
    await post(`/servers/${server.id}/${action}`, body);
    done();
  });

  if (!server.installed) {
    return (
      <Button size={size} variant="primary" icon={Download} loading={busy === 'install' || !!job} onClick={() => run('install', async () => { await post(`/servers/${server.id}/install`); done(); })}>
        {showLabels && (job ? 'Installing...' : 'Install')}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!alive && state !== 'stopping' && (
        <Button size={size} variant="success" icon={Play} disabled={!!job} loading={busy === 'start'} onClick={() => act('start', 'Start')}>{showLabels && 'Start'}</Button>
      )}
      {(alive || state === 'stopping') && (
        <>
          <Button size={size} variant="secondary" icon={RotateCw} disabled={state === 'stopping' || !!server.runtime.countdown} loading={busy === 'restart'} onClick={() => act('restart', 'Restart')}>{showLabels && 'Restart'}</Button>
          <Button size={size} variant="danger" icon={Square} disabled={state === 'stopping' || !!server.runtime.countdown} loading={busy === 'stop' || state === 'stopping'} onClick={() => act('stop', 'Stop')}>{showLabels && (state === 'stopping' ? 'Stopping' : 'Stop')}</Button>
        </>
      )}
    </div>
  );
}

export function JobProgress({ job }) {
  if (!job) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-2 text-xs text-sky-200">
        <span className="truncate">{job.label || job.type}</span>
        {job.progress !== null && job.progress !== undefined && <span className="num">{job.progress.toFixed(1)}%</span>}
      </div>
      <ProgressBar value={job.progress} />
    </div>
  );
}

export function ServerCard({ server }) {
  const r = server.runtime;
  const alive = ['running', 'starting'].includes(r.state);
  return (
    <Card className="group flex flex-col transition-colors hover:border-ink-600">
      <Link to={`/servers/${server.id}`} className="block flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GameBadge game={server.game} />
              <h3 className="truncate font-semibold text-ink-100 group-hover:text-brand-300">{server.name}</h3>
            </div>
            <p className="mt-1 truncate text-xs text-ink-400">{server.mapName} · port {server.ports.game}{server.cluster ? ` · ${server.cluster.name}` : ''}</p>
          </div>
          <StatusBadge server={server} className="shrink-0" />
        </div>
        {r.job ? (
          <div className="mt-4"><JobProgress job={r.job} /></div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <Stat icon={Users} label="Players" value={alive ? `${r.playerCount}/${server.maxPlayers}` : '—'} />
            <Stat icon={Cpu} label="CPU" value={alive ? pct(r.cpu) : '—'} />
            <Stat icon={MemoryStick} label="Memory" value={alive ? bytes(r.memory) : '—'} />
          </div>
        )}
        {server.updateAvailable && !r.job && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-ember-400"><ArrowUpCircle className="size-3.5" />Update available</div>
        )}
      </Link>
      <div className={cx('flex items-center justify-end border-t border-ink-700 px-4 py-2.5')}>
        <PowerButtons server={server} size="sm" />
      </div>
    </Card>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-ink-900/70 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-400"><Icon className="size-3" />{label}</div>
      <div className="num mt-0.5 truncate text-sm font-medium text-ink-100">{value}</div>
    </div>
  );
}
