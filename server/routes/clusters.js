import fs from 'node:fs';
import { Router } from 'express';
import { db, getCluster, newId } from '../db.js';
import { clusterDir } from '../config.js';
import { GAMES } from '../games.js';
import { ah, badRequest, conflict, notFound, sleep } from '../util/errors.js';
import * as sm from '../serverManager.js';
import { listBackups, createBackup, restoreBackup, deleteBackup, backupFile } from '../backups.js';

export const clustersRouter = Router();

const load = (req) => {
  const c = getCluster(req.params.id);
  if (!c) throw notFound('Cluster not found');
  return c;
};

const members = (c) => db.data.servers.filter((s) => s.clusterId === c.id);

function folderSize(dir) {
  let total = 0;
  const walk = (d) => {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else try { total += fs.statSync(p).size; } catch { /* ignore */ }
    }
  };
  walk(dir);
  return total;
}

const publicCluster = (c, { full = false } = {}) => ({
  ...c,
  gameName: GAMES[c.game].name,
  gameShort: GAMES[c.game].short,
  servers: members(c).map((s) => sm.publicServer(s)),
  ...(full ? { dataSize: folderSize(clusterDir(c.id)), path: clusterDir(c.id) } : {}),
});

function cleanKey(v) {
  const key = String(v || '').trim();
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(key)) throw badRequest('Cluster ID must be 3-40 characters (letters, numbers, - and _)');
  return key;
}

clustersRouter.get('/clusters', (req, res) => {
  res.json(db.data.clusters.map((c) => publicCluster(c)));
});

clustersRouter.post('/clusters', (req, res) => {
  const { name, game } = req.body || {};
  if (!GAMES[game]) throw badRequest('Unknown game');
  const n = String(name || '').trim().slice(0, 64);
  if (!n) throw badRequest('Name is required');
  const id = newId();
  const clusterKey = cleanKey(req.body.clusterKey || `${n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'cluster'}-${id.slice(0, 4)}`);
  if (db.data.clusters.some((c) => c.clusterKey === clusterKey)) throw badRequest('That cluster ID is already in use');
  const cluster = { id, name: n, game, clusterKey, createdAt: new Date().toISOString() };
  db.data.clusters.push(cluster);
  db.save();
  fs.mkdirSync(clusterDir(id), { recursive: true });
  res.status(201).json(publicCluster(cluster));
});

clustersRouter.get('/clusters/:id', (req, res) => {
  res.json(publicCluster(load(req), { full: true }));
});

clustersRouter.put('/clusters/:id', (req, res) => {
  const c = load(req);
  if (req.body?.name !== undefined) {
    const n = String(req.body.name).trim().slice(0, 64);
    if (!n) throw badRequest('Name is required');
    c.name = n;
  }
  if (req.body?.clusterKey !== undefined && req.body.clusterKey !== c.clusterKey) {
    const key = cleanKey(req.body.clusterKey);
    if (db.data.clusters.some((x) => x.id !== c.id && x.clusterKey === key)) throw badRequest('That cluster ID is already in use');
    c.clusterKey = key;
  }
  db.save();
  res.json(publicCluster(c));
});

clustersRouter.delete('/clusters/:id', ah(async (req, res) => {
  const c = load(req);
  const list = members(c);
  if (list.some((s) => sm.serverIsRunning(s.id))) throw conflict('Stop all servers in this cluster first');
  for (const s of list) s.clusterId = null;
  db.data.clusters = db.data.clusters.filter((x) => x.id !== c.id);
  db.data.schedules = db.data.schedules.filter((s) => !(s.targetType === 'cluster' && s.targetId === c.id));
  db.save();
  if (req.query.files === '1') await fs.promises.rm(clusterDir(c.id), { recursive: true, force: true });
  res.json({ ok: true });
}));

/* -------------------------- bulk power actions -------------------------- */

const each = (fn) => (req, res) => {
  const c = load(req);
  const results = [];
  for (const s of members(c)) {
    try { fn(s, req); results.push({ id: s.id, ok: true }); } catch (err) { results.push({ id: s.id, ok: false, error: err.message }); }
  }
  res.status(202).json({ results });
};

clustersRouter.post('/clusters/:id/start', (req, res) => {
  const c = load(req);
  const list = members(c).filter((s) => s.installed && !sm.serverIsRunning(s.id));
  // staggered start so the servers don't all load at the same moment
  (async () => {
    for (const s of list) {
      try { sm.startServer(s.id); } catch { /* reported in console */ }
      await sleep(20000);
    }
  })();
  res.status(202).json({ starting: list.length });
});
clustersRouter.post('/clusters/:id/stop', each((s, req) => { if (sm.serverIsRunning(s.id)) sm.stopServer(s.id, { warnMinutes: Number(req.body?.warnMinutes) || 0 }); }));
clustersRouter.post('/clusters/:id/restart', each((s, req) => { if (sm.serverIsRunning(s.id)) sm.restartServer(s.id, { warnMinutes: Number(req.body?.warnMinutes) || 0 }); }));
clustersRouter.post('/clusters/:id/update', each((s, req) => { if (s.installed) sm.updateGame(s.id, { warnMinutes: Number(req.body?.warnMinutes) || 0 }); }));
clustersRouter.post('/clusters/:id/broadcast', ah(async (req, res) => {
  const c = load(req);
  const msg = String(req.body?.message || '').trim();
  if (!msg) throw badRequest('Message is empty');
  await Promise.all(members(c).filter((s) => sm.serverIsRunning(s.id)).map((s) => sm.broadcast(s.id, msg)));
  res.json({ ok: true });
}));

/* ------------------------------ backups ------------------------------ */

clustersRouter.get('/clusters/:id/backups', (req, res) => {
  load(req);
  res.json({ backups: listBackups('cluster', req.params.id) });
});
clustersRouter.post('/clusters/:id/backups', ah(async (req, res) => {
  load(req);
  res.status(201).json(await createBackup('cluster', req.params.id, 'manual'));
}));
clustersRouter.post('/clusters/:id/backups/:name/restore', ah(async (req, res) => {
  load(req);
  await restoreBackup('cluster', req.params.id, req.params.name);
  res.json({ ok: true });
}));
clustersRouter.delete('/clusters/:id/backups/:name', (req, res) => {
  load(req);
  deleteBackup('cluster', req.params.id, req.params.name);
  res.json({ ok: true });
});
clustersRouter.get('/clusters/:id/backups/:name/download', (req, res) => {
  load(req);
  res.download(backupFile('cluster', req.params.id, req.params.name));
});
