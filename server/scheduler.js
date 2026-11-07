import { Cron } from 'croner';
import { db, newId, getServer, getCluster } from './db.js';
import { badRequest, notFound } from './util/errors.js';
import { hub } from './consoleHub.js';
import { createBackup } from './backups.js';
import {
  restartServer, stopServer, startServer, updateGame, sendCommand, broadcast, serverIsRunning, rt, checkUpdates,
} from './serverManager.js';

export const ACTIONS = {
  restart: 'Restart server',
  stop: 'Stop server',
  start: 'Start server',
  backup: 'Create backup',
  update: 'Update if available',
  broadcast: 'Broadcast message',
  command: 'Run RCON command',
};

const jobs = new Map();

function targets(schedule) {
  if (schedule.targetType === 'cluster') return db.data.servers.filter((s) => s.clusterId === schedule.targetId);
  const s = getServer(schedule.targetId);
  return s ? [s] : [];
}

async function runForServer(schedule, server) {
  const id = server.id;
  const warn = Number(schedule.warnMinutes) || 0;
  const running = serverIsRunning(id);
  switch (schedule.action) {
    case 'restart':
      if (!running) return 'skipped (not running)';
      await restartServer(id, { warnMinutes: warn });
      return 'restarted';
    case 'stop':
      if (!running) return 'skipped (not running)';
      await stopServer(id, { warnMinutes: warn });
      return 'stopped';
    case 'start':
      if (running) return 'skipped (already running)';
      await startServer(id);
      return 'started';
    case 'backup':
      if (schedule.targetType === 'cluster' && server === targets(schedule)[0]) {
        await createBackup('cluster', schedule.targetId, 'auto').catch(() => {});
      }
      await createBackup('server', id, 'auto');
      return 'backup created';
    case 'update': {
      await checkUpdates({ auto: false });
      const fresh = getServer(id);
      if (!fresh.updateAvailable) return 'no update available';
      await updateGame(id, { warnMinutes: running ? warn : 0 });
      return 'updated';
    }
    case 'broadcast':
      if (!running) return 'skipped (not running)';
      await broadcast(id, schedule.payload || '');
      return 'sent';
    case 'command':
      if (!running) return 'skipped (not running)';
      await sendCommand(id, schedule.payload || '');
      return 'sent';
    default:
      throw new Error('Unknown action');
  }
}

export async function runSchedule(schedule) {
  const list = targets(schedule);
  schedule.lastRun = new Date().toISOString();
  const results = await Promise.all(list.map(async (server) => {
    hub.log(server.id, `Scheduled task "${schedule.name}" (${ACTIONS[schedule.action]}) started.`, 'Schedule');
    try {
      if (rt(server.id).job) return `${server.name}: skipped (busy)`;
      const r = await runForServer(schedule, server);
      return `${server.name}: ${r}`;
    } catch (err) {
      hub.log(server.id, `Scheduled task failed: ${err.message}`, 'Schedule');
      return `${server.name}: failed (${err.message})`;
    }
  }));
  schedule.lastResult = results.join('; ') || 'no servers';
  db.save();
}

function arm(schedule) {
  jobs.get(schedule.id)?.stop();
  jobs.delete(schedule.id);
  if (!schedule.enabled) return;
  try {
    const job = new Cron(schedule.cron, { protect: true }, () => runSchedule(schedule).catch(() => {}));
    jobs.set(schedule.id, job);
  } catch (err) {
    console.error(`[scheduler] invalid cron for ${schedule.id}: ${err.message}`);
  }
}

export function nextRun(schedule) {
  const job = jobs.get(schedule.id);
  const next = job?.nextRun();
  return next ? next.toISOString() : null;
}

function validate(input, existing = {}) {
  const s = { ...existing };
  if (input.name !== undefined) s.name = String(input.name).trim().slice(0, 80);
  if (input.action !== undefined) {
    if (!ACTIONS[input.action]) throw badRequest('Unknown action');
    s.action = input.action;
  }
  if (input.targetType !== undefined) {
    if (!['server', 'cluster'].includes(input.targetType)) throw badRequest('Invalid target');
    s.targetType = input.targetType;
  }
  if (input.targetId !== undefined) s.targetId = String(input.targetId);
  if (s.targetType === 'server' && !getServer(s.targetId)) throw notFound('Server not found');
  if (s.targetType === 'cluster' && !getCluster(s.targetId)) throw notFound('Cluster not found');
  if (input.cron !== undefined) {
    const cron = String(input.cron).trim();
    try { new Cron(cron, { paused: true }).stop(); } catch (err) { throw badRequest(`Invalid schedule: ${err.message}`); }
    s.cron = cron;
  }
  if (input.warnMinutes !== undefined) s.warnMinutes = Math.max(0, Math.min(60, Number(input.warnMinutes) || 0));
  if (input.payload !== undefined) s.payload = String(input.payload).replace(/[\r\n]/g, ' ').slice(0, 500);
  if (input.enabled !== undefined) s.enabled = !!input.enabled;
  if (!s.name) s.name = ACTIONS[s.action] || 'Task';
  if (['broadcast', 'command'].includes(s.action) && !s.payload) throw badRequest('A message/command is required for this action');
  return s;
}

export function listSchedules(filter = {}) {
  return db.data.schedules
    .filter((s) => (!filter.targetId || s.targetId === filter.targetId))
    .map((s) => ({ ...s, nextRun: nextRun(s) }));
}

export function createSchedule(input) {
  if (!input.cron) throw badRequest('Schedule (cron) is required');
  const s = validate({ enabled: true, warnMinutes: 0, payload: '', ...input });
  s.id = newId();
  s.createdAt = new Date().toISOString();
  db.data.schedules.push(s);
  db.save();
  arm(s);
  return { ...s, nextRun: nextRun(s) };
}

export function updateSchedule(id, input) {
  const s = db.data.schedules.find((x) => x.id === id);
  if (!s) throw notFound('Schedule not found');
  Object.assign(s, validate(input, s));
  db.save();
  arm(s);
  return { ...s, nextRun: nextRun(s) };
}

export function deleteSchedule(id) {
  jobs.get(id)?.stop();
  jobs.delete(id);
  db.data.schedules = db.data.schedules.filter((x) => x.id !== id);
  db.save();
}

export function getSchedule(id) {
  const s = db.data.schedules.find((x) => x.id === id);
  if (!s) throw notFound('Schedule not found');
  return s;
}

export function initScheduler() {
  for (const s of db.data.schedules) arm(s);
}

/** Remove timers for schedules whose target no longer exists. */
export function pruneSchedules() {
  for (const [id, job] of jobs) {
    if (!db.data.schedules.some((s) => s.id === id)) { job.stop(); jobs.delete(id); }
  }
}
