import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
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
    // names have one-second resolution: never overwrite a backup made in the same second
    let name = `${stamp()}-${type}.tar.gz`;
    while (fs.existsSync(path.join(t.dir, name))) {
      await sleep(1000);
      name = `${stamp()}-${type}.tar.gz`;
    }
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
    if (offsiteRoot()) {
      try {
        await copyOffsite(t, name);
        logTo('Backup copied to the offsite location.');
      } catch (err) {
        logTo(`Offsite copy failed: ${err.message}`);
      }
    }
    return { name, size };
  } catch (err) {
    logTo(`Backup failed: ${err.message}`);
    throw err;
  } finally {
    running.delete(t.key);
  }
}

/* ------------------------------------------------------------------ */
/* Offsite copies                                                       */
/* A second copy of every backup on another disk / NAS mount, so saves  */
/* survive a broken VM disk. Layout: <path>/obelisk-backups/<key>/...   */
/* ------------------------------------------------------------------ */

export function offsiteRoot() {
  const o = settings().offsite;
  return o?.enabled && o.path ? path.join(o.path, 'obelisk-backups') : null;
}

function setOffsiteStatus(ok, message) {
  db.data.offsiteStatus = { ok, message, at: new Date().toISOString() };
  db.save();
}

async function copyFileAtomic(src, dest) {
  const tmp = `${dest}.partial`;
  try {
    await pipeline(fs.createReadStream(src), fs.createWriteStream(tmp));
    await fs.promises.rename(tmp, dest);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true });
    throw err;
  }
}

function offsiteRetention(dir) {
  const keep = Math.max(1, Number(settings().offsite?.keep) || 30);
  const files = fs.readdirSync(dir).filter((f) => NAME_RE.test(f)).sort((a, b) => b.localeCompare(a));
  for (const f of files.slice(keep)) fs.rmSync(path.join(dir, f), { force: true });
}

async function copyOffsite(t, name) {
  const root = offsiteRoot();
  if (!root) return;
  const dest = path.join(root, t.key);
  try {
    await fs.promises.mkdir(dest, { recursive: true });
    await fs.promises.writeFile(path.join(dest, 'name.txt'), `${t.cluster ? 'Cluster' : 'Server'}: ${t.label}\n`);
    await copyFileAtomic(path.join(t.dir, name), path.join(dest, name));
    offsiteRetention(dest);
    setOffsiteStatus(true, `Copied ${name} (${t.label})`);
  } catch (err) {
    setOffsiteStatus(false, err.message);
    throw err;
  }
}

/** Copy every local backup that is not offsite yet (e.g. after turning the feature on). */
export async function syncOffsite(log = () => {}) {
  const root = offsiteRoot();
  if (!root) throw badRequest('Offsite copies are turned off');
  let copied = 0;
  for (const key of fs.readdirSync(paths.backups)) {
    const dir = path.join(paths.backups, key);
    if (!fs.statSync(dir).isDirectory()) continue;
    const isCluster = key.startsWith('cluster-');
    const owner = isCluster ? getCluster(key.slice(8)) : getServer(key);
    const dest = path.join(root, key);
    await fs.promises.mkdir(dest, { recursive: true });
    if (owner) await fs.promises.writeFile(path.join(dest, 'name.txt'), `${isCluster ? 'Cluster' : 'Server'}: ${owner.name}\n`);
    const files = fs.readdirSync(dir).filter((f) => NAME_RE.test(f)).sort((a, b) => b.localeCompare(a))
      .slice(0, Math.max(1, Number(settings().offsite?.keep) || 30));
    for (const f of files) {
      if (fs.existsSync(path.join(dest, f))) continue;
      log(`Copying ${key}/${f}...`);
      await copyFileAtomic(path.join(dir, f), path.join(dest, f));
      copied++;
    }
    offsiteRetention(dest);
  }
  setOffsiteStatus(true, `Sync finished, ${copied} file(s) copied`);
  log(`Done: ${copied} backup(s) copied.`);
  return copied;
}

/** Check that a folder can be used as offsite location: absolute, exists, writable, not the data disk folder. */
export async function testOffsitePath(p) {
  const dir = String(p || '').trim();
  if (!path.isAbsolute(dir)) throw badRequest('Use an absolute path, e.g. /mnt/nas/ark');
  const resolved = path.resolve(dir);
  if (resolved === paths.backups || resolved.startsWith(path.dirname(paths.backups) + path.sep) || resolved === path.dirname(paths.backups)) {
    throw badRequest('Choose a location outside the Obelisk data folder (another disk or a NAS mount)');
  }
  if (!fs.existsSync(resolved)) throw badRequest('That folder does not exist. Mount your NAS or disk there first.');
  const probe = path.join(resolved, `.obelisk-write-test-${Date.now()}`);
  try {
    await fs.promises.writeFile(probe, 'ok');
    await fs.promises.rm(probe, { force: true });
  } catch (err) {
    throw badRequest(`Obelisk cannot write there (${err.code || err.message}). Give the "arkpanel" user write access, and use a folder under /mnt, /media or /srv.`);
  }
  let free = null;
  try { const s = fs.statfsSync(resolved); free = s.bavail * s.bsize; } catch { /* unknown */ }
  return { ok: true, free };
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
