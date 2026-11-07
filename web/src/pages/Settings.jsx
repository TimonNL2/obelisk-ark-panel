import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Cog, Wrench, Users, KeyRound, Info, Plus, Trash2, Download, RefreshCw, CheckCircle2, ArrowUpCircle, Save } from 'lucide-react';
import { del, get, post, put } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { dateTime, timeAgo } from '../lib/format.js';
import { useApp } from '../App.jsx';
import {
  Alert, Badge, Button, Card, CardHeader, Field, Input, Loading, Modal, PageHeader, Select, Tabs, useAction, useConfirm, useToast,
} from '../components/ui.jsx';

const TABS = [
  { id: 'general', label: 'General', icon: Cog },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'account', label: 'My account', icon: KeyRound },
  { id: 'about', label: 'About & update', icon: Info },
];

function General() {
  const [s, setS] = useState(null);
  const [busy, run] = useAction();
  const { reloadSession } = useApp();
  useEffect(() => { get('/settings').then(setS); }, []);
  if (!s) return <Loading />;
  const set = (p) => setS({ ...s, ...p });
  const num = (k) => (e) => set({ [k]: Number(e.target.value) });
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); run('save', async () => { setS(await put('/settings', s)); reloadSession(); }, 'Settings saved'); }}>
      <Card>
        <CardHeader title="Panel" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Panel name"><Input value={s.panelName} onChange={(e) => set({ panelName: e.target.value })} /></Field>
          <Field label="Public IP / hostname" hint="Used to show connect addresses. Leave empty to detect automatically."><Input value={s.publicIp} onChange={(e) => set({ publicIp: e.target.value })} placeholder="auto" /></Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Servers" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Keep scheduled backups" hint="Per server. Manual backups are never deleted automatically."><Input type="number" min={1} value={s.backupRetention} onChange={num('backupRetention')} /></Field>
          <Field label="Check for game updates every (min)"><Input type="number" min={10} value={s.updateCheckMinutes} onChange={num('updateCheckMinutes')} /></Field>
          <Field label="Graceful stop timeout (s)" hint="Wait this long after SaveWorld + DoExit before killing."><Input type="number" min={15} value={s.stopTimeoutSeconds} onChange={num('stopTimeoutSeconds')} /></Field>
          <Field label="First game port" hint="New servers get the next free port from here."><Input type="number" value={s.basePort} onChange={num('basePort')} /></Field>
          <Field label="First query port (ASE)"><Input type="number" value={s.baseQueryPort} onChange={num('baseQueryPort')} /></Field>
          <Field label="First RCON port"><Input type="number" value={s.baseRconPort} onChange={num('baseRconPort')} /></Field>
        </div>
      </Card>
      <div className="flex justify-end"><Button type="submit" variant="primary" icon={Save} loading={busy === 'save'}>Save settings</Button></div>
    </form>
  );
}

function JobLog({ job, title, onClose }) {
  return (
    <Modal open={!!job} onClose={onClose} title={title} size="lg" footer={<Button onClick={onClose}>{job?.running ? 'Run in background' : 'Close'}</Button>}>
      {job && (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm">
            {job.running ? <><RefreshCw className="size-4 animate-spin text-sky-300" />Running...</> : job.error ? <span className="text-red-300">Failed: {job.error}</span> : <><CheckCircle2 className="size-4 text-emerald-300" />Done</>}
          </div>
          <pre className="max-h-[50vh] overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-xs text-ink-200">{job.log.join('\n') || '...'}</pre>
        </>
      )}
    </Modal>
  );
}

function Tools() {
  const { data: info, reload } = usePoll(() => get('/system/info'), 2000);
  const [busy, run] = useAction();
  const confirm = useConfirm();
  const [showJob, setShowJob] = useState(null);
  if (!info) return <Loading />;
  const job = showJob ? info.jobs[showJob] : null;

  const start = (type, url, method = post) => run(type, async () => { await method(url); setShowJob(type); await reload(); });

  return (
    <div className="space-y-5">
      {!info.isLinux && <Alert type="warning" title="Not running on Linux">Game servers can only be installed and started when the panel runs on Linux (Ubuntu Server).</Alert>}
      <Card>
        <CardHeader title="SteamCMD" subtitle="Downloads and updates the game server files"
          actions={info.steamcmd.installed ? <Badge color="green">Installed</Badge> : <Badge color="red">Not installed</Badge>} />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-ink-300">{info.steamcmd.queue ? `${info.steamcmd.queue} SteamCMD task(s) queued or running.` : 'Only one SteamCMD task runs at a time; others wait in a queue.'}</p>
          <Button icon={Download} loading={busy === 'steamcmd' || info.jobs.steamcmd?.running} onClick={() => start('steamcmd', '/system/steamcmd/install')}>{info.steamcmd.installed ? 'Reinstall SteamCMD' : 'Install SteamCMD'}</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="GE-Proton" subtitle="Compatibility layer that runs the Windows-only ARK: Survival Ascended server on Linux"
          actions={<Button size="sm" icon={Download} loading={busy === 'proton' || info.jobs.proton?.running} onClick={() => start('proton', '/system/proton/install-latest')}>Install latest</Button>} />
        {info.proton.versions.length === 0 ? (
          <div className="p-5 text-sm text-ink-300">No Proton version installed. It is downloaded automatically when you start your first ASA server, or click “Install latest”.</div>
        ) : (
          <div className="divide-y divide-ink-700/70">
            {info.proton.versions.map((v) => (
              <div key={v} className="flex items-center gap-3 px-5 py-3">
                <span className="flex-1 font-mono text-sm">{v}</span>
                {v === info.proton.active ? <Badge color="green">Active</Badge> : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => run('act', async () => { await put('/system/proton/active', { version: v }); await reload(); }, `${v} is now active (restart ASA servers to use it)`)}>Use this</Button>
                    <Button size="icon" variant="danger-ghost" aria-label="Remove" onClick={async () => { if (await confirm({ title: `Remove ${v}?`, danger: true, confirmLabel: 'Remove' })) run('rm', async () => { await del(`/system/proton/${v}`); await reload(); }); }}><Trash2 className="size-4" /></Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Game updates" subtitle={`Last check: ${info.lastUpdateCheck ? timeAgo(info.lastUpdateCheck) : 'never'}`}
          actions={<Button size="sm" icon={RefreshCw} disabled={!info.steamcmd.installed} loading={busy === 'check'} onClick={() => run('check', async () => { await post('/system/check-updates'); await reload(); }, 'Update check finished')}>Check now</Button>} />
        <div className="p-5 text-sm text-ink-300">The panel asks Steam for new builds automatically. Servers with “Update automatically” enabled are updated with a 5 minute warning; others show an “Update available” badge.</div>
      </Card>
      <JobLog job={job} title={showJob === 'proton' ? 'Installing GE-Proton' : 'Installing SteamCMD'} onClose={() => setShowJob(null)} />
    </div>
  );
}

function UsersTab() {
  const { user: me } = useApp();
  const { data: users, reload } = usePoll(() => get('/users'), 0);
  const [form, setForm] = useState({ username: '', password: '' });
  const [busy, run] = useAction();
  const confirm = useConfirm();
  if (!users) return <Loading />;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader icon={Users} title="Users" subtitle="Every user has full access to the panel" />
        <div className="divide-y divide-ink-700/70">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold uppercase text-brand-300">{u.username[0]}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{u.username} {u.id === me.id && <span className="text-xs text-ink-400">(you)</span>}</div>
                <div className="text-xs text-ink-400">Created {dateTime(u.createdAt)}, last login {timeAgo(u.lastLoginAt)}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={async () => {
                const pw = await confirm({ title: `New password for ${u.username}`, input: true, placeholder: 'At least 8 characters', confirmLabel: 'Set password' });
                if (pw) run('pw', () => put(`/users/${u.id}/password`, { password: pw }), 'Password changed');
              }}>Change password</Button>
              {u.id !== me.id && (
                <Button size="icon" variant="danger-ghost" aria-label="Delete user" onClick={async () => {
                  if (await confirm({ title: `Delete ${u.username}?`, danger: true, confirmLabel: 'Delete' })) run('del', async () => { await del(`/users/${u.id}`); await reload(); });
                }}><Trash2 className="size-4" /></Button>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader icon={Plus} title="Add user" />
        <form className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); run('add', async () => { await post('/users', form); setForm({ username: '', password: '' }); await reload(); }, 'User created'); }}>
          <Field label="Username"><Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" /></Field>
          <Field label="Password"><Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
          <Button type="submit" variant="primary" icon={Plus} loading={busy === 'add'}>Add user</Button>
        </form>
      </Card>
    </div>
  );
}

function Account() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, run] = useAction();
  const toast = useToast();
  const submit = (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) { toast.error('The new passwords do not match'); return; }
    run('pw', async () => { await post('/auth/password', form); setForm({ currentPassword: '', newPassword: '', confirm: '' }); }, 'Password changed. Other sessions were signed out.');
  };
  return (
    <Card className="max-w-xl">
      <CardHeader icon={KeyRound} title="Change password" />
      <form className="space-y-4 p-5" onSubmit={submit}>
        <Field label="Current password"><Input type="password" required autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
        <Field label="New password" hint="At least 8 characters."><Input type="password" required minLength={8} autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
        <Field label="Repeat new password"><Input type="password" required autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
        <Button type="submit" variant="primary" loading={busy === 'pw'}>Change password</Button>
      </form>
    </Card>
  );
}

function About() {
  const { data: info, reload } = usePoll(() => get('/system/info'), 2000);
  const [busy, run] = useAction();
  const confirm = useConfirm();
  const [show, setShow] = useState(false);
  if (!info) return <Loading />;
  const job = info.jobs.panel;
  const rows = [
    ['Version', `${info.version}${info.commit ? ` (${info.commit})` : ''}`],
    ['Node.js', info.node],
    ['Data folder', info.dataDir],
    ['Panel port', info.panelPort],
    ['Public IP', info.publicIp || 'unknown'],
    ['Local IPs', info.localIps.join(', ') || '—'],
  ];
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader icon={Info} title="About this panel" />
        <div className="divide-y divide-ink-700/60 px-5">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2.5 text-sm"><span className="text-ink-300">{k}</span><span className="truncate font-mono text-ink-100">{v}</span></div>)}
        </div>
      </Card>
      <Card>
        <CardHeader icon={ArrowUpCircle} title="Update the panel" subtitle="Pulls the latest version from GitHub, rebuilds and restarts the panel. Game servers keep running." />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-ink-300">You can also update from the shell: <code className="rounded bg-ink-800 px-1 font-mono text-ink-100">sudo arkpanel update</code></p>
          <Button variant="primary" icon={Download} loading={busy === 'up' || job?.running} onClick={async () => {
            if (!(await confirm({ title: 'Update the panel now?', message: 'The panel restarts at the end and you may need to reload the page.', confirmLabel: 'Update' }))) return;
            run('up', async () => { await post('/system/update-panel'); setShow(true); await reload(); });
          }}>Update panel</Button>
        </div>
      </Card>
      <JobLog job={show ? job : null} title="Updating panel" onClose={() => setShow(false)} />
    </div>
  );
}

export default function Settings() {
  const { tab = 'general' } = useParams();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Settings" subtitle="Panel configuration, tools and users" />
      <Tabs tabs={TABS} active={tab} onChange={(t) => navigate(`/settings/${t === 'general' ? '' : t}`)} />
      <div className="mt-5">
        {tab === 'general' && <General />}
        {tab === 'tools' && <Tools />}
        {tab === 'users' && <UsersTab />}
        {tab === 'account' && <Account />}
        {tab === 'about' && <About />}
      </div>
    </>
  );
}
