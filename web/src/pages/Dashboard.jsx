import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, HardDrive, MemoryStick, Plus, Server, Users, Network } from 'lucide-react';
import { get } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { bytes, duration, pct } from '../lib/format.js';
import { Button, Card, EmptyState, Loading, Meter, PageHeader } from '../components/ui.jsx';
import { useServers } from '../components/Layout.jsx';
import { ServerCard } from '../components/ServerBits.jsx';
import CreateServerModal from '../components/CreateServerModal.jsx';

function StatCard({ icon: Icon, label, value, sub, meter }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-300"><Icon className="size-4 text-ink-400" />{label}</div>
      <div className="num mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="num mt-0.5 text-xs text-ink-400">{sub}</div>}
      {meter !== undefined && <div className="mt-3"><Meter value={meter} /></div>}
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
      <PageHeader
        title="Dashboard"
        subtitle={h ? `${h.hostname} · up ${duration(h.uptime * 1000)} · ${h.cores} cores` : 'Overview of your host and servers'}
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New server</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Cpu} label="CPU" value={h ? pct(h.cpu) : '—'} sub={h ? `load ${h.load.map((l) => l.toFixed(2)).join(' · ')}` : ''} meter={h?.cpu} />
        <StatCard icon={MemoryStick} label="Memory" value={h ? bytes(h.memory.used) : '—'} sub={h ? `of ${bytes(h.memory.total)} · servers use ${bytes(s.memory)}` : ''} meter={h ? (h.memory.used / h.memory.total) * 100 : undefined} />
        <StatCard icon={HardDrive} label="Disk" value={h ? bytes(h.disk.used) : '—'} sub={h ? `${bytes(h.disk.free)} free of ${bytes(h.disk.total)}` : ''} meter={h?.disk.total ? (h.disk.used / h.disk.total) * 100 : undefined} />
        <StatCard icon={Users} label="Players online" value={s ? s.players : '—'} sub={s ? `${s.running} of ${s.total} servers online${s.starting ? ` · ${s.starting} starting` : ''}` : ''} />
      </div>

      <div className="mt-8">
        {servers === undefined ? <Loading /> : servers.length === 0 ? (
          <Card>
            <EmptyState icon={Server} title="No servers yet" action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Create your first server</Button>}>
              Create an ARK: Survival Ascended or Survival Evolved server. The panel downloads the game, configures it and keeps it running.
            </EmptyState>
          </Card>
        ) : (
          <div className="space-y-8">
            {groups.map(({ cluster, servers: list }) => (
              <section key={cluster.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Link to={`/clusters/${cluster.id}`} className="flex items-center gap-2 text-sm font-semibold text-ink-200 hover:text-brand-300">
                    <Network className="size-4 text-ink-400" />{cluster.name}
                    <span className="font-normal text-ink-400">· {list.filter((x) => x.runtime.state === 'running').length}/{list.length} online</span>
                  </Link>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((srv) => <ServerCard key={srv.id} server={srv} />)}
                </div>
              </section>
            ))}
            {standalone.length > 0 && (
              <section>
                {groups.length > 0 && <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-200"><Server className="size-4 text-ink-400" />Standalone servers</div>}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {standalone.map((srv) => <ServerCard key={srv.id} server={srv} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      <CreateServerModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
