import { Archive, Download, RotateCcw, Trash2, Plus } from 'lucide-react';
import { del, get, post } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { bytes, dateTime, timeAgo } from '../lib/format.js';
import { Badge, Button, Card, CardHeader, EmptyState, Loading, useAction, useConfirm } from './ui.jsx';

const TYPE = {
  manual: ['Manual', 'blue'],
  auto: ['Scheduled', 'teal'],
  'pre-restore': ['Before restore', 'yellow'],
  'pre-update': ['Before update', 'yellow'],
};

/** kind: 'servers' | 'clusters' */
export default function BackupsPanel({ kind, id, description, canRestore = true, restoreHint }) {
  const base = `/${kind}/${id}/backups`;
  const { data, reload } = usePoll(() => get(base), 10000, [base]);
  const [busy, run] = useAction();
  const confirm = useConfirm();

  const create = () => run('create', async () => { await post(base); await reload(); }, 'Backup created');
  const restore = async (b) => {
    const ok = await confirm({
      title: 'Restore this backup?',
      message: <>The current save data is replaced by the backup from <b>{dateTime(b.createdAt)}</b>. A safety backup of the current state is made first.</>,
      danger: true,
      confirmLabel: 'Restore',
    });
    if (ok) run(`restore-${b.name}`, async () => { await post(`${base}/${encodeURIComponent(b.name)}/restore`); await reload(); }, 'Backup restored');
  };
  const remove = async (b) => {
    if (await confirm({ title: 'Delete backup?', message: b.name, danger: true, confirmLabel: 'Delete' })) {
      run(`del-${b.name}`, async () => { await del(`${base}/${encodeURIComponent(b.name)}`); await reload(); });
    }
  };

  const list = data?.backups;
  const total = (list || []).reduce((a, b) => a + b.size, 0);

  return (
    <Card>
      <CardHeader
        icon={Archive}
        title="Backups"
        subtitle={description || (list ? `${list.length} backup(s), ${bytes(total)} in total` : '')}
        actions={<Button variant="primary" size="sm" icon={Plus} loading={busy === 'create' || data?.running} onClick={create}>Create backup</Button>}
      />
      {!list ? <Loading /> : list.length === 0 ? (
        <EmptyState icon={Archive} title="No backups yet">Create a backup manually or add a scheduled backup task. Scheduled backups are rotated automatically (Settings → backup retention).</EmptyState>
      ) : (
        <div className="divide-y divide-ink-700/70">
          {list.map((b) => {
            const [label, color] = TYPE[b.type] || [b.type, 'gray'];
            return (
              <div key={b.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{dateTime(b.createdAt)}</span>
                    <Badge color={color}>{label}</Badge>
                  </div>
                  <div className="num mt-0.5 text-xs text-ink-400">{bytes(b.size)}, {timeAgo(b.createdAt)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={Download} onClick={() => { window.location.href = `/api${base}/${encodeURIComponent(b.name)}/download`; }}>Download</Button>
                  {canRestore && <Button size="sm" variant="ghost" icon={RotateCcw} title={restoreHint} loading={busy === `restore-${b.name}`} onClick={() => restore(b)}>Restore</Button>}
                  <Button size="icon" variant="danger-ghost" aria-label="Delete backup" loading={busy === `del-${b.name}`} onClick={() => remove(b)}><Trash2 className="size-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
