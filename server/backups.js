import fs from 'node:fs';
import path from 'node:path';
import { paths, serverDir, clusterDir } from './config.js';
import { db, getServer, getCluster, settings } from './db.js';
import { runCommand } from './util/exec.js';
import { badRequest, conflict, notFound, sleep } from './util/errors.js';
import { hub } from './consoleHub.js';
import { rt, rcon, serverIsRunning } from './serverManager.js';

/**
 * Backups are plain .tar.gz archives:
 *  - server backups contain ShooterGame/Saved (world saves, player data, config; logs excluded)
 *  - cluster backups contain the shared cluster transfer folder
 * File name: <YYYYMMDD-HHMMSS>-<kind>.tar.gz  (kind = manual | auto | pre-restore | pre-update)
 */
const NAME_RE = /^(\d{8}-\d{6})-([a-z-]+)\.tar\.gz$/;
const running = new Set();

function target(kind, id) {
  if (kind === 'server') {
    const server = getServer(id);
    if (!server) throw notFound('Server not found');
    return { key: id, dir: path.join(paths.backups, id), base: serverDir(id), rel: 'ShooterGame/Saved', server, label: server.name };
  }
  if (kind === 'cluster') {
    const cluster = getCluster(id);
    if (!cluster) throw notFound('Cluster not found');
    return { key: `cluster-${id}`, dir: path.join(paths.backups, `cluster-${id}`), base: paths.clusters, rel: id, cluster, label: cluster.name };
  }
  throw badRequest('Unknown backup target');
}

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function listBackups(kind, id) {
  const t = target(kind, id);
  let files = [];
  try { files = fs.readdirSync(t.dir); } catch { return []; }
  return files
    .filter((f) => NAME_RE.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(t.dir, f));
      const [, , type] = NAME_RE.exec(f);
      return { name: f, type, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function backupFile(kind, id, name) {
  const t = target(kind, id);
  if (!NAME_RE.test(name)) throw badRequest('Invalid backup name');
  const file = path.join(t.dir, name);
  if (!fs.existsSync(file)) throw notFound('Backup not found');
  return file;
}

export function isBackupRunning(kind, id) {
  return running.has(target(kind, id).key);
}

export async function createBackup(kind, id, type = 'manual') {
  const t = target(kind, id);
  if (running.has(t.key)) throw conflict('A backup is already running');
  const src = path.join(t.base, t.rel);
  if (!fs.existsSync(src)) throw badRequest('Nothing to back up yet (no save data found).');
  running.add(t.key);
  const logTo = (msg) => (t.server ? hub.log(t.server.id, msg, 'Backup') : null);
  try {
    if (t.server && serverIsRunning(t.server.id) && rt(t.server.id).state === 'running') {
      try {
        await rcon(t.server.id, 'SaveWorld', 60000);
        logTo('World saved, creating backup...');
        await sleep(3000);
      } catch (err) {
        logTo(`Could not save world before backup (${err.message}), backing up the last save.`);
      }
    }
    fs.mkdirSync(t.dir, { recursive: true });
    const name = `${stamp()}-${type}.tar.gz`;
    const partial = path.join(t.dir, `${name}.partial`);
    const args = ['-czf', partial, '-C', t.base];
    if (kind === 'server') args.push('--exclude=ShooterGame/Saved/Logs', '--exclude=ShooterGame/Saved/Crashes');
    args.push(t.rel);
    const res = await runCommand('tar', args);
    // GNU tar exits with 1 when files changed while reading (normal for a running server)
    if (res.code !== 0 && res.code !== 1) {
      fs.rmSync(partial, { force: true });
      throw new Error(`tar failed (${res.code}): ${res.output.split('\n').slice(-2).join(' ')}`);
    }
    fs.renameSync(partial, path.join(t.dir, name));
    const size = fs.statSync(path.join(t.dir, name)).size;
    logTo(`Backup created: ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    applyRetention(kind, id);
    return { name, size };
  } catch (err) {
    logTo(`Backup failed: ${err.message}`);
    throw err;
  } finally {
    running.delete(t.key);
  }
}

function applyRetention(kind, id) {
  const keep = Math.max(1, Number(settings().backupRetention) || 10);
  const t = target(kind, id);
  const autos = listBackups(kind, id).filter((b) => b.type !== 'manual');
  for (const b of autos.slice(keep)) fs.rmSync(path.join(t.dir, b.name), { force: true });
}

export async function restoreBackup(kind, id, name) {
  const t = target(kind, id);
  const file = backupFile(kind, id, name);
  if (t.server && (serverIsRunning(t.server.id) || !['stopped', 'crashed'].includes(rt(t.server.id).state))) {
    throw conflict('Stop the server before restoring a backup');
  }
  if (t.cluster) {
    const busy = db.data.servers.filter((s) => s.clusterId === id && serverIsRunning(s.id));
    if (busy.length) throw conflict(`Stop all servers in this cluster first (${busy.map((s) => s.name).join(', ')})`);
  }
  if (running.has(t.key)) throw conflict('A backup is running');
  const src = path.join(t.base, t.rel);
  if (fs.existsSync(src)) await createBackup(kind, id, 'pre-restore');
  const logTo = (msg) => (t.server ? hub.log(t.server.id, msg, 'Backup') : null);
  logTo(`Restoring backup ${name}...`);
  if (kind === 'server') {
    // keep logs, replace everything else
    for (const entry of fs.existsSync(src) ? fs.readdirSync(src) : []) {
      if (entry === 'Logs') continue;
      await fs.promises.rm(path.join(src, entry), { recursive: true, force: true });
    }
  } else {
    await fs.promises.rm(src, { recursive: true, force: true });
  }
  const res = await runCommand('tar', ['-xzf', file, '-C', t.base]);
  if (res.code !== 0) throw new Error(`Restore failed: ${res.output.split('\n').slice(-2).join(' ')}`);
  logTo('Backup restored.');
}

export function deleteBackup(kind, id, name) {
  fs.rmSync(backupFile(kind, id, name), { force: true });
}
