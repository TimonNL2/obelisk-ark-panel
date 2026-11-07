import { useState } from 'react';
import { Ban, RefreshCw, UserX, Users, MessageSquare } from 'lucide-react';
import { get, post } from '../../lib/api.js';
import { usePoll } from '../../lib/hooks.js';
import { Alert, Button, Card, CardHeader, CopyButton, EmptyState, Input, Loading, useAction, useConfirm } from '../../components/ui.jsx';

export default function Players({ server }) {
  const { data, reload } = usePoll(() => get(`/servers/${server.id}/players`), 15000, [server.id]);
  const [busy, run] = useAction();
  const confirm = useConfirm();
  const [unban, setUnban] = useState('');
  const [message, setMessage] = useState('');

  const act = async (action, p) => {
    const verb = action === 'kick' ? 'Kick' : 'Ban';
    if (!(await confirm({ title: `${verb} ${p.name}?`, danger: action === 'ban', confirmLabel: verb }))) return;
    run(`${action}-${p.id}`, async () => { await post(`/servers/${server.id}/players/${action}`, { playerId: p.id }); await reload(); }, `${p.name} ${action === 'kick' ? 'kicked' : 'banned'}`);
  };

  if (!data) return <Loading />;
  if (!data.online) {
    return <Card><EmptyState icon={Users} title="Server is offline">Start the server to see who is online.</EmptyState></Card>;
  }

  return (
    <div className="space-y-5">
      {data.error && <Alert type="warning" title="Could not refresh the player list">{data.error}</Alert>}
      <Card>
        <CardHeader icon={Users} title={`Online players (${data.players.length}/${server.maxPlayers})`}
          actions={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={reload}>Refresh</Button>} />
        {data.players.length === 0 ? (
          <EmptyState icon={Users} title="Nobody online right now" />
        ) : (
          <div className="divide-y divide-ink-700/70">
            {data.players.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold uppercase">{p.name.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="flex items-center gap-1 font-mono text-xs text-ink-400">{p.id}<CopyButton value={p.id} /></div>
                </div>
                <Button size="sm" variant="ghost" icon={UserX} loading={busy === `kick-${p.id}`} onClick={() => act('kick', p)}>Kick</Button>
                <Button size="sm" variant="danger-ghost" icon={Ban} loading={busy === `ban-${p.id}`} onClick={() => act('ban', p)}>Ban</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader icon={MessageSquare} title="Broadcast message" subtitle="Shown on the screen of every player" />
          <form className="flex gap-2 p-5" onSubmit={(e) => { e.preventDefault(); run('bc', async () => { await post(`/servers/${server.id}/broadcast`, { message }); setMessage(''); }, 'Message sent'); }}>
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Server restart in 10 minutes!" />
            <Button type="submit" variant="primary" disabled={!message.trim()} loading={busy === 'bc'}>Send</Button>
          </form>
        </Card>
        <Card>
          <CardHeader icon={Ban} title="Unban a player" subtitle="Enter the EOS / Steam ID of the player" />
          <form className="flex gap-2 p-5" onSubmit={(e) => { e.preventDefault(); run('unban', async () => { await post(`/servers/${server.id}/players/unban`, { playerId: unban.trim() }); setUnban(''); }, 'Player unbanned'); }}>
            <Input className="font-mono" value={unban} onChange={(e) => setUnban(e.target.value)} placeholder="0002abc..." />
            <Button type="submit" disabled={!unban.trim()} loading={busy === 'unban'}>Unban</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
