import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { config, paths } from '../config.js';
import { db } from '../db.js';
import { ah, badRequest, conflict } from '../util/errors.js';
import { hostStats } from '../util/procs.js';
import { runCommand } from '../util/exec.js';
import { GAMES } from '../games.js';
import { GAME_SETTINGS } from '../gameSettings.js';
import { ACTIONS, listSchedules, createSchedule, updateSchedule, deleteSchedule, getSchedule, runSchedule } from '../scheduler.js';
import { publicIp, localIps } from '../network.js';
import * as tools from '../tools.js';
import * as sm from '../serverManager.js';
import { offsiteRoot, syncOffsite, testOffsitePath } from '../backups.js';

export const systemRouter = Router();

/* ---------- background jobs for tools / panel updates ---------- */
const jobs = {};
function startJob(type, fn) {
  if (jobs[type]?.running) throw conflict('This task is already running');
  const job = { type, running: true, log: [], error: null, startedAt: new Date().toISOString(), finishedAt: null };
  jobs[type] = job;
  const logLine = (l) => { job.log.push(l); if (job.log.length > 500) job.log.shift(); };
  Promise.resolve()
    .then(() => fn(logLine))
    .catch((err) => { job.error = err.message; logLine(`Error: ${err.message}`); })
    .finally(() => { job.running = false; job.finishedAt = new Date().toISOString(); });
  return job;
}

function gitCommit() {
  try {
    const head = fs.readFileSync(path.join(config.appDir, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head.slice(0, 7);
    const ref = head.slice(5);
    const file = path.join(config.appDir, '.git', ref);
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim().slice(0, 7);
    const packed = fs.readFileSync(path.join(config.appDir, '.git', 'packed-refs'), 'utf8');
    return (new RegExp(`([0-9a-f]{40}) ${ref}`).exec(packed) || [])[1]?.slice(0, 7) || null;
  } catch {
    return null;
  }
}

systemRouter.get('/meta', (req, res) => {
  res.json({
    games: Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, short: g.short, maps: g.maps, defaultMaxPlayers: g.defaultMaxPlayers, usesQueryPort: g.usesQueryPort })),
    scheduleActions: ACTIONS,
    copyParts: sm.COPY_PARTS,
    gameSettings: GAME_SETTINGS,
  });
});

systemRouter.get('/system/stats', (req, res) => {
  const servers = db.data.servers.map((s) => sm.rt(s.id));
  res.json({
    host: hostStats(),
    servers: {
      total: servers.length,
      running: servers.filter((r) => r.state === 'running').length,
      starting: servers.filter((r) => r.state === 'starting').length,
      players: servers.reduce((a, r) => a + r.players.length, 0),
      memory: servers.reduce((a, r) => a + r.memory, 0),
    },
  });
});

systemRouter.get('/system/info', (req, res) => {
  res.json({
    version: config.version,
    commit: gitCommit(),
    node: process.version,
    isLinux: config.isLinux,
    dataDir: config.dataDir,
    publicIp: db.data.settings.publicIp || publicIp(),
    detectedPublicIp: publicIp(),
    localIps: localIps(),
    panelPort: config.port,
    steamcmd: { installed: tools.steamcmdInstalled(), queue: tools.steamcmdQueueLength() },
    proton: { versions: tools.protonVersions(), active: tools.activeProton(), recommended: tools.RECOMMENDED_PROTON },
    lastUpdateCheck: db.data.lastUpdateCheck || null,
    jobs,
  });
});

systemRouter.post('/system/steamcmd/install', (req, res) => {
  startJob('steamcmd', (log) => tools.installSteamcmd(log));
  res.status(202).json({ ok: true });
});

systemRouter.post('/system/proton/install-recommended', (req, res) => {
  startJob('proton', (log) => tools.installRecommendedProton(log));
  res.status(202).json({ ok: true });
});

systemRouter.post('/system/proton/install-latest', (req, res) => {
  startJob('proton', (log) => tools.installLatestProton(log));
  res.status(202).json({ ok: true });
});

systemRouter.put('/system/proton/active', (req, res) => {
  const v = String(req.body?.version || '');
  if (!tools.protonVersions().includes(v)) throw badRequest('Unknown Proton version');
  db.data.settings.activeProton = v;
  db.save();
  res.json({ ok: true });
});

systemRouter.delete('/system/proton/:version', (req, res) => {
  if (tools.protonVersions().length <= 1) throw badRequest('Keep at least one Proton version installed');
  tools.removeProton(req.params.version);
  res.json({ ok: true });
});

systemRouter.post('/system/check-updates', ah(async (req, res) => {
  if (!tools.steamcmdInstalled()) throw badRequest('SteamCMD is not installed');
  await sm.checkUpdates({ auto: false });
  res.json({ ok: true, servers: db.data.servers.map((s) => ({ id: s.id, buildId: s.buildId, latestBuildId: s.latestBuildId, updateAvailable: s.updateAvailable })) });
}));

systemRouter.post('/system/update-panel', (req, res) => {
  if (!fs.existsSync(path.join(config.appDir, '.git'))) throw badRequest('The panel was not installed from git, update it manually.');
  startJob('panel', async (log) => {
    const script = path.join(config.appDir, 'scripts', 'self-update.sh');
    const result = await runCommand('bash', [script], { cwd: config.appDir, onLine: log });
    if (result.code !== 0) throw new Error(`Update script failed (exit ${result.code})`);
    log('Update finished. Restarting the panel in 3 seconds (game servers keep running)...');
    setTimeout(() => process.exit(0), 3000);
  });
  res.status(202).json({ ok: true });
});

/* ------------------------------ settings ------------------------------ */

systemRouter.get('/settings', (req, res) => {
  res.json(db.data.settings);
});

systemRouter.put('/settings', (req, res) => {
  const s = db.data.settings;
  const b = req.body || {};
  if (b.panelName !== undefined) s.panelName = String(b.panelName).trim().slice(0, 40) || 'Obelisk';
  if (b.publicIp !== undefined) {
    const ip = String(b.publicIp).trim();
    if (ip && !/^[a-zA-Z0-9.:-]+$/.test(ip)) throw badRequest('Invalid IP / hostname');
    s.publicIp = ip;
  }
  const num = (key, min, max) => {
    if (b[key] === undefined) return;
    const v = Number(b[key]);
    if (!Number.isInteger(v) || v < min || v > max) throw badRequest(`${key} must be between ${min} and ${max}`);
    s[key] = v;
  };
  num('backupRetention', 1, 500);
  num('updateCheckMinutes', 10, 1440);
  num('basePort', 1024, 65000);
  num('baseQueryPort', 1024, 65000);
  num('baseRconPort', 1024, 65000);
  num('stopTimeoutSeconds', 15, 900);
  db.save();
  res.json(s);
});

/* ------------------------------ offsite backups ------------------------------ */

systemRouter.put('/settings/offsite', ah(async (req, res) => {
  const b = req.body || {};
  const next = { ...db.data.settings.offsite };
  if (b.keep !== undefined) {
    const keep = Number(b.keep);
    if (!Number.isInteger(keep) || keep < 1 || keep > 1000) throw badRequest('Keep must be between 1 and 1000');
    next.keep = keep;
  }
  if (b.path !== undefined) next.path = String(b.path).trim();
  if (b.enabled !== undefined) next.enabled = !!b.enabled;
  if (next.enabled) await testOffsitePath(next.path);
  db.data.settings.offsite = next;
  db.save();
  res.json({ offsite: next, status: db.data.offsiteStatus || null });
}));

systemRouter.post('/settings/offsite/test', ah(async (req, res) => {
  res.json(await testOffsitePath(req.body?.path));
}));

systemRouter.get('/settings/offsite', (req, res) => {
  res.json({ offsite: db.data.settings.offsite, status: db.data.offsiteStatus || null, job: jobs.offsite || null });
});

systemRouter.post('/settings/offsite/sync', (req, res) => {
  if (!offsiteRoot()) throw badRequest('Turn on offsite copies first');
  startJob('offsite', (log) => syncOffsite(log));
  res.status(202).json({ ok: true });
});

/* ------------------------------ schedules ------------------------------ */

systemRouter.get('/schedules', (req, res) => {
  res.json(listSchedules({ targetId: req.query.targetId }));
});
systemRouter.post('/schedules', (req, res) => {
  res.status(201).json(createSchedule(req.body || {}));
});
systemRouter.put('/schedules/:id', (req, res) => {
  res.json(updateSchedule(req.params.id, req.body || {}));
});
systemRouter.delete('/schedules/:id', (req, res) => {
  deleteSchedule(req.params.id);
  res.json({ ok: true });
});
systemRouter.post('/schedules/:id/run', (req, res) => {
  const s = getSchedule(req.params.id);
  runSchedule(s).catch(() => {});
  res.status(202).json({ ok: true });
});

export { paths };
