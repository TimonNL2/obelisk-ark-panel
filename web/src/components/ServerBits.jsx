import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, Square, RotateCw, Download, ArrowUpCircle } from 'lucide-react';
import { post } from '../lib/api.js';
import { bytes } from '../lib/format.js';
import { AnimatedNumber, Button, GameBadge, ProgressBar, StatusBadge, cx, stateInfo, useAction, useConfirm } from './ui.jsx';
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
        title: `${label} ${server.name}?`,
        message: `${server.runtime.playerCount} player(s) are online. They get an in-game countdown first.`,
        confirmLabel: `${label} in 5 minutes`,
        checkbox: `${label} right now, without a warning`,
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
        {showLabels && (job ? 'Installing' : 'Install')}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!alive && state !== 'stopping' && (
        <Button size={size} variant="success" icon={Play} disabled={!!job} loading={busy === 'start'} onClick={() => act('start', 'Start')} title="Start">{showLabels && 'Start'}</Button>
      )}
      {(alive || state === 'stopping') && (
        <>
          <Button size={size} variant="secondary" icon={RotateCw} disabled={state === 'stopping' || !!server.runtime.countdown} loading={busy === 'restart'} onClick={() => act('restart', 'Restart')} title="Restart">{showLabels && 'Restart'}</Button>
          <Button size={size} variant="danger" icon={Square} disabled={state === 'stopping' || !!server.runtime.countdown} loading={busy === 'stop' || state === 'stopping'} onClick={() => act('stop', 'Stop')} title="Stop">{showLabels && (state === 'stopping' ? 'Stopping' : 'Stop')}</Button>
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
        {job.progress !== null && job.progress !== undefined && <AnimatedNumber value={job.progress} format={(v) => `${v.toFixed(1)}%`} />}
      </div>
      <ProgressBar value={job.progress} />
    </div>
  );
}

export function ServerCard({ server }) {
  const r = server.runtime;
  const alive = ['running', 'starting'].includes(r.state);
  const s = stateInfo(server);
  return (
    <motion.div layout="position" className="surface group relative flex flex-col overflow-hidden rounded-[14px] border border-ink-700/80 transition-colors hover:border-ink-600">
      {/* obelisk beam along the left edge shows the state at a glance */}
      <span className={cx('absolute inset-y-0 left-0 w-[3px]', s.key === 'online' && 'beam-breathe')} style={{ background: `linear-gradient(to top, ${s.color}, transparent 90%)`, opacity: s.key === 'off' || s.key === 'none' ? 0.35 : 1 }} />
      <Link to={`/servers/${server.id}`} className="block flex-1 p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GameBadge game={server.game} />
              <h3 className="truncate text-[17px] font-semibold text-ink-100 transition-colors group-hover:text-brand-300">{server.name}</h3>
            </div>
            <p className="mt-1 truncate text-xs text-ink-400">{server.mapName}, port {server.ports.game}</p>
          </div>
          <StatusBadge server={server} className="shrink-0 pt-1" />
        </div>
        {r.job ? (
          <div className="mt-4"><JobProgress job={r.job} /></div>
        ) : (
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="Players" value={alive ? <><AnimatedNumber value={r.playerCount} /><span className="text-ink-400">/{server.maxPlayers}</span></> : '—'} />
            <Stat label="CPU" value={alive ? <AnimatedNumber value={r.cpu} format={(v) => `${Math.round(v)}%`} /> : '—'} />
            <Stat label="Memory" value={alive ? bytes(r.memory) : '—'} />
          </dl>
        )}
        {server.updateAvailable && !r.job && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-ember-400"><ArrowUpCircle className="size-3.5" />Update available</div>
        )}
      </Link>
      <div className="flex items-center justify-end border-t border-ink-700/70 px-4 py-2.5">
        <PowerButtons server={server} size="sm" />
      </div>
    </motion.div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-[10px] bg-ink-900/70 px-2.5 py-2">
      <dt className="text-[11px] text-ink-400">{label}</dt>
      <dd className="mt-0.5 truncate font-display text-[15px] font-semibold text-ink-100">{value}</dd>
    </div>
  );
}
