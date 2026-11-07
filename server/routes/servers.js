import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { db, getServer } from '../db.js';
import { serverDir } from '../config.js';
import { ah, badRequest, notFound } from '../util/errors.js';
import { configPath } from '../games.js';
import { parseIni, getIniValue } from '../util/ini.js';
import { GAME_SETTINGS, INI_FILES, PRESETS, STATS, STAT_GROUPS, normaliseOverrides, removedKeys } from '../gameSettings.js';
import { parsePlayers } from '../rcon.js';
import { hub } from '../consoleHub.js';
import * as sm from '../serverManager.js';
import { listBackups, createBackup, restoreBackup, deleteBackup, backupFile, isBackupRunning } from '../backups.js';

export const serversRouter = Router();

const load = (req) => {
  const server = getServer(req.params.id);
  if (!server) throw notFound('Server not found');
  return server;
};

serversRouter.get('/servers', (req, res) => {
  res.json(db.data.servers.map((s) => sm.publicServer(s)));
});

serversRouter.get('/servers/suggest-ports', (req, res) => {
  res.json(sm.suggestPorts(req.query.game === 'ase' ? 'ase' : 'asa'));
});

serversRouter.post('/servers', (req, res) => {
  const server = sm.createServer(req.body || {});
  res.status(201).json(sm.publicServer(server));
});

serversRouter.get('/servers/:id', (req, res) => {
  res.json(sm.publicServer(load(req), { full: true }));
});

serversRouter.put('/servers/:id', (req, res) => {
  const server = sm.updateServer(req.params.id, req.body || {});
  res.json(sm.publicServer(server));
});

serversRouter.delete('/servers/:id', ah(async (req, res) => {
  await sm.deleteServer(req.params.id, { deleteBackups: req.query.backups === '1' });
  res.json({ ok: true });
}));

/* ------------------------------ power ------------------------------ */

const warn = (req) => Math.max(0, Math.min(60, Number(req.body?.warnMinutes) || 0));

serversRouter.post('/servers/:id/start', (req, res) => {
  sm.startServer(req.params.id);
  res.status(202).json({ ok: true });
});
serversRouter.post('/servers/:id/stop', (req, res) => {
  sm.stopServer(req.params.id, { warnMinutes: warn(req) });
  res.status(202).json({ ok: true });
});
serversRouter.post('/servers/:id/restart', (req, res) => {
  sm.restartServer(req.params.id, { warnMinutes: warn(req) });
  res.status(202).json({ ok: true });
});
serversRouter.post('/servers/:id/kill', ah(async (req, res) => {
  await sm.killServer(req.params.id);
  res.json({ ok: true });
}));
serversRouter.post('/servers/:id/copy-settings', (req, res) => {
  load(req);
  const targets = Array.isArray(req.body?.targets) ? req.body.targets.map(String) : [];
  if (!targets.length) throw badRequest('Choose at least one server');
  res.json({ results: sm.copySettings(req.params.id, targets, req.body?.parts) });
});

serversRouter.post('/servers/:id/clone', (req, res) => {
  load(req);
  const { server } = sm.cloneServer(req.params.id, req.body || {});
  res.status(201).json(sm.publicServer(server));
});

serversRouter.post('/servers/:id/install', (req, res) => {
  sm.installServer(req.params.id, { validate: !!req.body?.validate });
  res.status(202).json({ ok: true });
});
serversRouter.post('/servers/:id/update', (req, res) => {
  sm.updateGame(req.params.id, { warnMinutes: warn(req), validate: !!req.body?.validate });
  res.status(202).json({ ok: true });
});
serversRouter.post('/servers/:id/command', ah(async (req, res) => {
  const output = await sm.sendCommand(req.params.id, req.body?.command);
  res.json({ output });
}));
serversRouter.post('/servers/:id/broadcast', ah(async (req, res) => {
  load(req);
  const msg = String(req.body?.message || '').trim();
  if (!msg) throw badRequest('Message is empty');
  await sm.broadcast(req.params.id, msg);
  hub.log(req.params.id, `Broadcast: ${msg}`);
  res.json({ ok: true });
}));
serversRouter.post('/servers/:id/console/clear', (req, res) => {
  load(req);
  hub.clear(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------ players ------------------------------ */

serversRouter.get('/servers/:id/players', ah(async (req, res) => {
  load(req);
  const r = sm.rt(req.params.id);
  if (!sm.serverIsRunning(req.params.id)) return res.json({ players: [], online: false });
  try {
    const out = await sm.rcon(req.params.id, 'ListPlayers', 5000);
    r.players = parsePlayers(out);
    r.playersAt = Date.now();
  } catch (err) {
    return res.json({ players: r.players, online: true, error: err.message });
  }
  res.json({ players: r.players, online: true });
}));

const playerAction = (cmd) => ah(async (req, res) => {
  load(req);
  const pid = String(req.body?.playerId || '').trim();
  if (!/^[0-9a-fA-F]{8,64}$/.test(pid)) throw badRequest('Invalid player id');
  const output = await sm.sendCommand(req.params.id, `${cmd} ${pid}`);
  res.json({ output });
});
serversRouter.post('/servers/:id/players/kick', playerAction('KickPlayer'));
serversRouter.post('/servers/:id/players/ban', playerAction('BanPlayer'));
serversRouter.post('/servers/:id/players/unban', playerAction('UnbanPlayer'));

/* ------------------------------ config files ------------------------------ */

const iniFile = (req, server) => {
  const file = req.params.file;
  if (!INI_FILES.includes(file)) throw badRequest('Unknown config file');
  return configPath(serverDir(server.id), server, file);
};

serversRouter.get('/servers/:id/config/:file', (req, res) => {
  const server = load(req);
  const file = iniFile(req, server);
  let content = '';
  let exists = false;
  try { content = fs.readFileSync(file, 'utf8'); exists = true; } catch { /* not created yet */ }
  res.json({ content, exists, running: sm.serverIsRunning(server.id) });
});

serversRouter.put('/servers/:id/config/:file', (req, res) => {
  const server = load(req);
  const file = iniFile(req, server);
  if (typeof req.body?.content !== 'string') throw badRequest('Content must be text');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, req.body.content);
  hub.log(server.id, `${req.params.file} saved by ${req.user.username}.`);
  res.json({ ok: true });
});


serversRouter.get('/servers/:id/game-settings', (req, res) => {
  const server = load(req);
  const current = {};
  for (const file of INI_FILES) {
    let parsed = {};
    try { parsed = parseIni(fs.readFileSync(configPath(serverDir(server.id), server, file), 'utf8')); } catch { /* none */ }
    for (const def of GAME_SETTINGS.filter((d) => d.file === file)) {
      const v = getIniValue(parsed, def.section, def.key);
      if (v !== undefined) {
        current[file] ||= {};
        current[file][def.section] ||= {};
        current[file][def.section][def.key] = v;
      }
    }
  }
  res.json({
    catalog: GAME_SETTINGS.filter((d) => !d.games || d.games.includes(server.game)),
    overrides: server.iniOverrides || {},
    current,
    presets: PRESETS,
    stats: { names: STATS, groups: STAT_GROUPS },
  });
});

serversRouter.put('/servers/:id/game-settings', (req, res) => {
  const server = load(req);
  const next = normaliseOverrides(req.body?.overrides || {});
  const removed = removedKeys(server.iniOverrides, next);
  const pending = server.pendingIniRemovals || [];
  for (const r of removed) if (!pending.some((p) => p.join('|') === r.join('|'))) pending.push(r);
  server.pendingIniRemovals = pending;
  server.iniOverrides = next;
  db.save();
  const running = sm.serverIsRunning(server.id);
  if (!running) sm.applyManagedIni(server);
  hub.log(server.id, `Game settings updated by ${req.user.username}${running ? ' (applied on next restart)' : ''}.`);
  res.json({ ok: true, appliedNow: !running });
});

/* ------------------------------ backups ------------------------------ */

serversRouter.get('/servers/:id/backups', (req, res) => {
  load(req);
  res.json({ backups: listBackups('server', req.params.id), running: isBackupRunning('server', req.params.id) });
});
serversRouter.post('/servers/:id/backups', ah(async (req, res) => {
  load(req);
  const result = await createBackup('server', req.params.id, 'manual');
  res.status(201).json(result);
}));
serversRouter.post('/servers/:id/backups/:name/restore', ah(async (req, res) => {
  load(req);
  await restoreBackup('server', req.params.id, req.params.name);
  res.json({ ok: true });
}));
serversRouter.delete('/servers/:id/backups/:name', (req, res) => {
  load(req);
  deleteBackup('server', req.params.id, req.params.name);
  res.json({ ok: true });
});
serversRouter.get('/servers/:id/backups/:name/download', (req, res) => {
  load(req);
  res.download(backupFile('server', req.params.id, req.params.name));
});
