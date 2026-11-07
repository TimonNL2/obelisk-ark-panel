import { Link } from 'react-router-dom';
import { Cpu, MemoryStick, Users, Clock, Info, Terminal, Download } from 'lucide-react';
import { post } from '../../lib/api.js';
import { bytes, duration, pct } from '../../lib/format.js';
import { Alert, Button, Card, CardHeader, CopyButton, Sparkline, useAction } from '../../components/ui.jsx';
import { JobProgress } from '../../components/ServerBits.jsx';
import ConsoleView from '../../components/ConsoleView.jsx';

function Metric({ icon: Icon, label, value, sub, points, max, color }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-300"><Icon className="size-4 text-ink-400" />{label}</div>
      <div className="num mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="num text-xs text-ink-400">{sub}</div>}
      {points && <div className="mt-2"><Sparkline points={points} max={max} color={color} /></div>}
    </Card>
  );
}

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
    <span className="text-ink-300">{label}</span>
    <span className="min-w-0 truncate text-right text-ink-100">{children}</span>
  </div>
);

export default function Overview({ server }) {
  const r = server.runtime;
  const alive = ['running', 'starting'].includes(r.state);
  const hist = r.history || [];
  const [busy, run] = useAction();

  return (
    <div className="space-y-5">
      {!server.installed && !r.job && (
        <Alert type="info" title="This server is not installed yet"
          action={<Button size="sm" variant="primary" icon={Download} loading={busy === 'install'} onClick={() => run('install', () => post(`/servers/${server.id}/install`), 'Installation started')}>Install now</Button>}>
          Download the game files with SteamCMD. You can follow the progress in the console.
        </Alert>
      )}
      {r.job && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-sky-200">{{ install: 'Installing game files', update: 'Updating server', validate: 'Validating game files' }[r.job.type] || 'Working'}</div>
            <Link to={`/servers/${server.id}/console`} className="text-xs text-ink-300 hover:text-ink-100">Open console</Link>
          </div>
          <JobProgress job={r.job} />
        </Card>
      )}
      {r.state === 'starting' && !r.job && (
        <Alert type="info" title="Server is starting">
          {server.game === 'asa'
            ? 'ARK: Survival Ascended usually needs 2-5 minutes to start (longer on the very first launch while Proton sets up). The status switches to Online as soon as RCON answers.'
            : 'The server is loading the map. The status switches to Online as soon as RCON answers.'}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={Users} label="Players" value={alive ? `${r.playerCount} / ${server.maxPlayers}` : '—'} points={hist.map((h) => h.players)} max={Math.max(5, server.maxPlayers / 4)} color="#a78bfa" />
        <Metric icon={Cpu} label="CPU (of host)" value={alive ? pct(r.cpu) : '—'} points={hist.map((h) => h.cpu)} max={100} />
        <Metric icon={MemoryStick} label="Memory" value={alive ? bytes(r.memory) : '—'} sub={alive ? `${r.processes} process(es)` : ''} points={hist.map((h) => h.mem)} color="#f59e0b" />
        <Metric icon={Clock} label="Uptime" value={alive && r.startedAt ? duration(Date.now() - r.startedAt) : '—'} sub={r.rconOk ? 'RCON connected' : alive ? 'Waiting for RCON...' : ''} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader icon={Info} title="Server details" />
          <div className="divide-y divide-ink-700/60 px-5">
            <Row label="Game">{server.gameName}</Row>
            <Row label="Map">{server.mapName}</Row>
            <Row label="Session name">{server.sessionName}</Row>
            {server.connect && <Row label="Connect address"><span className="font-mono">{server.connect}</span><CopyButton value={server.connect} /></Row>}
            <Row label="Game port"><span className="num font-mono">{server.ports.game} UDP{server.game === 'ase' ? ` (+${server.ports.game + 1})` : ''}</span></Row>
            {server.ports.query && <Row label="Query port"><span className="num font-mono">{server.ports.query} UDP</span></Row>}
            <Row label="RCON port"><span className="num font-mono">{server.ports.rcon} TCP</span></Row>
            <Row label="Cluster">{server.cluster ? <Link className="text-brand-300 hover:underline" to={`/clusters/${server.cluster.id}`}>{server.cluster.name}</Link> : 'None'}</Row>
            <Row label="Mods">{(server.mods || []).filter((m) => m.enabled !== false).length || 'None'}</Row>
            <Row label="Build">{server.buildId || '—'}{server.updateAvailable && <span className="ml-2 text-ember-400">(new: {server.latestBuildId})</span>}</Row>
          </div>
        </Card>
        <div className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold"><Terminal className="size-4 text-ink-300" />Live console</div>
            <Link to={`/servers/${server.id}/console`} className="text-xs text-ink-300 hover:text-ink-100">Open full console</Link>
          </div>
          <ConsoleView server={server} height="h-[340px]" compact />
        </div>
      </div>
    </div>
  );
}
