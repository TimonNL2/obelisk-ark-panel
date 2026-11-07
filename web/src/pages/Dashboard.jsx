import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Plus, Server, Network } from 'lucide-react';
import { get } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { bytes, duration } from '../lib/format.js';
import { AnimatedNumber, Button, Card, EmptyState, Loading, Ring, cx, stateInfo } from '../components/ui.jsx';
import { useServers } from '../components/Layout.jsx';
import { ServerCard } from '../components/ServerBits.jsx';
import Obelisk from '../components/Obelisk.jsx';
import CreateServerModal from '../components/CreateServerModal.jsx';

/** The skyline: every server as an obelisk, lit when it is online. */
function Skyline({ servers }) {
  const online = servers.filter((s) => s.runtime.state === 'running').length;
  const players = servers.reduce((a, s) => a + s.runtime.playerCount, 0);
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/80 to-transparent" />
      <div className="relative flex flex-wrap items-end justify-between gap-6 px-6 pt-6">
        <div>
          <h2 className="text-[22px] font-semibold leading-tight">
            <AnimatedNumber value={online} /> of {servers.length} server{servers.length === 1 ? '' : 's'} online
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            {players ? <><AnimatedNumber value={players} /> survivor{players === 1 ? '' : 's'} playing right now</> : 'Nobody is playing right now'}
          </p>
        </div>
      </div>
      <div className="relative flex items-end gap-1 overflow-x-auto px-4 pb-4 pt-2 [scrollbar-width:none]">
        {servers.map((s, i) => {
          const info = stateInfo(s);
          return (
            <Link key={s.id} to={`/servers/${s.id}`} className="group flex w-[104px] shrink-0 flex-col items-center rounded-xl px-2 pb-2 pt-1 transition-colors hover:bg-ink-800/60">
              <Obelisk info={info} height={190 + ((i * 37) % 3) * 18} width={30} pillar={0.42} delay={0.15 + i * 0.08} />
              <div className="mt-2 w-full truncate text-center font-display text-sm font-semibold text-ink-100 group-hover:text-brand-300">{s.name}</div>
              <div className={cx('mt-0.5 w-full truncate text-center text-[11px]', info.text)}>
                {info.key === 'online' ? `${s.runtime.playerCount} playing` : info.label}
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function HostStat({ label, value, sub, percent }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <Ring value={percent} size={52} stroke={5}>
        <span className="num font-display text-[11px] font-semibold text-ink-200">{percent === undefined ? '' : `${Math.round(percent)}%`}</span>
      </Ring>
      <div className="min-w-0">
        <div className="text-xs text-ink-400">{label}</div>
        <div className="truncate font-display text-lg font-semibold">{value}</div>
        {sub && <div className="truncate text-xs text-ink-400">{sub}</div>}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { servers, clusters } = useServers();
  const stats = usePoll(() => get('/system/stats'), 3000);
  const [creating, setCreating] = useState(false);
  const h = stats.data?.host;
  const s = stats.data?.servers;

  const standalone = (servers || []).filter((x) => !x.cluster);
  const groups = (clusters || []).map((c) => ({ cluster: c, servers: (servers || []).filter((x) => x.clusterId === c.id) })).filter((g) => g.servers.length);

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-300">{h ? `${h.hostname}, up for ${duration(h.uptime * 1000)}` : 'Your host and servers'}</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New server</Button>
      </div>

      {servers === undefined ? <Loading rows={2} /> : servers.length === 0 ? (
        <Card>
          <EmptyState icon={Server} title="No servers yet" action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Create your first server</Button>}>
            Create an ARK: Survival Ascended or Survival Evolved server. Obelisk downloads the game, writes the config and keeps it running.
          </EmptyState>
        </Card>
      ) : <Skyline servers={servers} />}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HostStat label="CPU" percent={h?.cpu} value={h ? `${h.cores} cores` : '—'} sub={h ? `Load ${h.load[0].toFixed(2)}` : ''} />
        <HostStat label="Memory" percent={h ? (h.memory.used / h.memory.total) * 100 : undefined} value={h ? `${bytes(h.memory.used)} used` : '—'} sub={h ? `of ${bytes(h.memory.total)}, servers ${bytes(s.memory)}` : ''} />
        <HostStat label="Disk" percent={h?.disk.total ? (h.disk.used / h.disk.total) * 100 : undefined} value={h ? `${bytes(h.disk.free)} free` : '—'} sub={h ? `of ${bytes(h.disk.total)}` : ''} />
        <HostStat label="Servers" percent={s?.total ? (s.running / s.total) * 100 : 0} value={s ? `${s.running} online` : '—'} sub={s ? `${s.total} total${s.starting ? `, ${s.starting} starting` : ''}` : ''} />
      </div>

      {servers?.length > 0 && (
        <div className="mt-10 space-y-9">
          {groups.map(({ cluster, servers: list }) => (
            <section key={cluster.id}>
              <Link to={`/clusters/${cluster.id}`} className="mb-3 inline-flex items-center gap-2 text-[15px] font-semibold text-ink-200 transition-colors hover:text-brand-300">
                <Network className="size-4 text-ink-400" />
                <span className="font-display">{cluster.name}</span>
                <span className="text-sm font-normal text-ink-400">{list.filter((x) => x.runtime.state === 'running').length} of {list.length} online</span>
              </Link>
              <motion.div layout className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.map((srv) => <ServerCard key={srv.id} server={srv} />)}
              </motion.div>
            </section>
          ))}
          {standalone.length > 0 && (
            <section>
              {groups.length > 0 && <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink-200"><Server className="size-4 text-ink-400" /><span className="font-display">Standalone</span></div>}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {standalone.map((srv) => <ServerCard key={srv.id} server={srv} />)}
              </div>
            </section>
          )}
        </div>
      )}
      <CreateServerModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
