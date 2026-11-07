import { useEffect, useState } from 'react';
import { CalendarClock, Play, Plus, Trash2, Pencil } from 'lucide-react';
import { del, get, post, put } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { describeCron, dateTime, timeAgo } from '../lib/format.js';
import { useApp } from '../App.jsx';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Loading, Modal, Select, Toggle, useAction, useConfirm } from './ui.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WARN_ACTIONS = ['restart', 'stop', 'update'];

function toCron(t) {
  const [hh, mm] = (t.time || '04:00').split(':').map(Number);
  switch (t.mode) {
    case 'daily': return `${mm} ${hh} * * *`;
    case 'weekly': return `${mm} ${hh} * * ${t.day}`;
    case 'hours': return `${mm} */${t.every} * * *`;
    case 'minutes': return `*/${t.every} * * * *`;
    default: return t.cron;
  }
}

function fromCron(cron) {
  const p = (cron || '').split(/\s+/);
  const pad = (n) => String(n).padStart(2, '0');
  if (p.length === 5) {
    const [m, h, dom, mon, dow] = p;
    const num = (x) => /^\d+$/.test(x);
    if (num(m) && num(h) && dom === '*' && mon === '*' && dow === '*') return { mode: 'daily', time: `${pad(h)}:${pad(m)}`, day: 1, every: 6, cron };
    if (num(m) && num(h) && dom === '*' && mon === '*' && num(dow)) return { mode: 'weekly', time: `${pad(h)}:${pad(m)}`, day: Number(dow), every: 6, cron };
    if (num(m) && /^\*\/\d+$/.test(h) && dom === '*' && mon === '*' && dow === '*') return { mode: 'hours', time: `00:${pad(m)}`, every: Number(h.slice(2)), day: 1, cron };
    if (/^\*\/\d+$/.test(m) && h === '*' && dom === '*' && mon === '*' && dow === '*') return { mode: 'minutes', every: Number(m.slice(2)), time: '00:00', day: 1, cron };
  }
  return { mode: 'custom', time: '04:00', day: 1, every: 6, cron: cron || '0 4 * * *' };
}

function ScheduleModal({ open, onClose, initial, targetType, targetId, onSaved }) {
  const { meta } = useApp();
  const [form, setForm] = useState(null);
  const [timing, setTiming] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...initial } : { name: '', action: 'restart', warnMinutes: 10, payload: '', enabled: true });
    setTiming(fromCron(initial?.cron || '0 4 * * *'));
    setError(null);
  }, [open, initial]);

  if (!open || !form) return null;
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const setT = (p) => setTiming((t) => ({ ...t, ...p }));
  const cron = toCron(timing);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, cron, targetType, targetId, name: form.name || meta.scheduleActions[form.action] };
      if (initial) await put(`/schedules/${initial.id}`, body);
      else await post('/schedules', body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit scheduled task' : 'New scheduled task'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="schedule-form" loading={busy}>Save</Button></>}>
      <form id="schedule-form" onSubmit={save} className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Action">
            <Select value={form.action} onChange={(e) => set({ action: e.target.value })}>
              {Object.entries(meta.scheduleActions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Name (optional)">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={meta.scheduleActions[form.action]} />
          </Field>
        </div>

        <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Repeat">
              <Select value={timing.mode} onChange={(e) => setT({ mode: e.target.value })}>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="hours">Every X hours</option>
                <option value="minutes">Every X minutes</option>
                <option value="custom">Custom (cron)</option>
              </Select>
            </Field>
            {timing.mode === 'weekly' && (
              <Field label="Day">
                <Select value={timing.day} onChange={(e) => setT({ day: Number(e.target.value) })}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </Select>
              </Field>
            )}
            {(timing.mode === 'daily' || timing.mode === 'weekly') && (
              <Field label="Time"><Input type="time" value={timing.time} onChange={(e) => setT({ time: e.target.value })} /></Field>
            )}
            {timing.mode === 'hours' && (
              <Field label="Every (hours)"><Input type="number" min={1} max={23} value={timing.every} onChange={(e) => setT({ every: Number(e.target.value) || 1 })} /></Field>
            )}
            {timing.mode === 'minutes' && (
              <Field label="Every (minutes)"><Input type="number" min={1} max={59} value={timing.every} onChange={(e) => setT({ every: Number(e.target.value) || 1 })} /></Field>
            )}
            {timing.mode === 'custom' && (
              <Field label="Cron expression" className="sm:col-span-2" hint="minute hour day-of-month month day-of-week">
                <Input className="font-mono" value={timing.cron} onChange={(e) => setT({ cron: e.target.value })} />
              </Field>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-300">Runs: <span className="text-ink-100">{describeCron(cron)}</span> <span className="font-mono text-ink-400">({cron})</span> · server time</p>
        </div>

        {WARN_ACTIONS.includes(form.action) && (
          <Field label="Warn players beforehand (minutes)" hint="Players get in-game countdown messages. 0 = no warning. Only used when the server is online.">
            <Input type="number" min={0} max={60} value={form.warnMinutes} onChange={(e) => set({ warnMinutes: Number(e.target.value) })} />
          </Field>
        )}
        {form.action === 'broadcast' && (
          <Field label="Message"><Input required value={form.payload} onChange={(e) => set({ payload: e.target.value })} placeholder="Join our Discord!" /></Field>
        )}
        {form.action === 'command' && (
          <Field label="RCON command"><Input required className="font-mono" value={form.payload} onChange={(e) => set({ payload: e.target.value })} placeholder="DestroyWildDinos" /></Field>
        )}
        <Toggle checked={form.enabled} onChange={(v) => set({ enabled: v })} label="Enabled" />
      </form>
    </Modal>
  );
}

export default function SchedulesPanel({ targetType, targetId, subtitle }) {
  const { meta } = useApp();
  const { data, reload } = usePoll(() => get(`/schedules?targetId=${targetId}`), 15000, [targetId]);
  const [modal, setModal] = useState(null);
  const [busy, run] = useAction();
  const confirm = useConfirm();

  const toggle = (s) => run(`t-${s.id}`, async () => { await put(`/schedules/${s.id}`, { enabled: !s.enabled }); await reload(); });
  const runNow = async (s) => {
    if (await confirm({ title: `Run "${s.name}" now?`, confirmLabel: 'Run now' })) run(`r-${s.id}`, () => post(`/schedules/${s.id}/run`), 'Task started');
  };
  const remove = async (s) => {
    if (await confirm({ title: `Delete "${s.name}"?`, danger: true, confirmLabel: 'Delete' })) run(`d-${s.id}`, async () => { await del(`/schedules/${s.id}`); await reload(); });
  };

  return (
    <Card>
      <CardHeader icon={CalendarClock} title="Scheduled tasks" subtitle={subtitle || 'Automatic restarts, backups, updates and messages'}
        actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setModal({})}>New task</Button>} />
      {!data ? <Loading /> : data.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No scheduled tasks" action={<Button size="sm" icon={Plus} onClick={() => setModal({})}>Add a task</Button>}>
          Tip: a daily restart with a 10 minute warning and a backup every 6 hours keeps most servers healthy.
        </EmptyState>
      ) : (
        <div className="divide-y divide-ink-700/70">
          {data.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge color="gray">{meta.scheduleActions[s.action]}</Badge>
                  {!s.enabled && <Badge color="yellow">Paused</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-ink-400">
                  {describeCron(s.cron)}{s.warnMinutes ? ` · ${s.warnMinutes} min warning` : ''}
                  {s.enabled && s.nextRun && <> · next {dateTime(s.nextRun)}</>}
                  {s.lastRun && <> · last {timeAgo(s.lastRun)}{s.lastResult ? ` (${s.lastResult})` : ''}</>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Toggle checked={s.enabled} onChange={() => toggle(s)} label="" />
                <Button size="icon" variant="ghost" aria-label="Run now" title="Run now" loading={busy === `r-${s.id}`} onClick={() => runNow(s)}><Play className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Edit" title="Edit" onClick={() => setModal({ initial: s })}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="danger-ghost" aria-label="Delete" title="Delete" onClick={() => remove(s)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ScheduleModal open={!!modal} initial={modal?.initial} onClose={() => setModal(null)} targetType={targetType} targetId={targetId} onSaved={reload} />
    </Card>
  );
}
