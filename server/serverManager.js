import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { config, paths, serverDir, clusterDir, prefixDir, consoleLogFile } from './config.js';
import { db, getServer, getCluster, newId, settings } from './db.js';
import { GAMES, gameOf, mapName, buildLaunch, managedGusValues, configPath } from './games.js';
import { hub } from './consoleHub.js';
import { rconCommand, parsePlayers } from './rcon.js';
import { scanTaggedProcesses, processUsage, cpuPercent, killPids } from './util/procs.js';
import { setIniValues } from './util/ini.js';
import { runCommand } from './util/exec.js';
import { badRequest, conflict, notFound, sleep } from './util/errors.js';
import { ensureSteamcmd, ensureProton, steamAppUpdate, installedBuildId, latestBuildId, protonDir, RECOMMENDED_PROTON } from './tools.js';
import { publicIp } from './network.js';

/* ------------------------------------------------------------------ */
/* Runtime state (not persisted)                                       */
/* ------------------------------------------------------------------ */

const runtime = new Map();
export function rt(id) {
  if (!runtime.has(id)) {
    runtime.set(id, {
      state: 'stopped', // stopped | starting | running | stopping | crashed
      pids: [],
      cpu: 0,
      memory: 0,
      players: [],
      playersAt: null,
      rconOk: false,
      rconError: null,
      startedAt: null,
      job: null, // { type, label, progress }
      countdown: null, // { verb, endsAt }
      lastError: null,
      crashTimes: [],
      child: null,
      launched: null,
      lastPoll: 0,
      history: [],
      lastSample: 0,
    });
  }
  return runtime.get(id);
}

const isAlive = (id) => rt(id).pids.length > 0;
export const serverIsRunning = isAlive;

function currentPids(id) {
  const r = rt(id);
  if (config.isLinux) return scanTaggedProcesses().get(id) || [];
  return r.child && r.child.exitCode === null && !r.child.killed ? [r.child.pid] : [];
}

async function waitForExit(id, ms) {
  const until = Date.now() + ms;
  for (;;) {
    const pids = currentPids(id);
    rt(id).pids = pids;
    if (!pids.length) return true;
    if (Date.now() >= until) return false;
    await sleep(1000);
  }
}

const log = (id, msg, prefix) => hub.log(id, msg, prefix);

/* ------------------------------------------------------------------ */
/* Ports                                                                */
/* ------------------------------------------------------------------ */

function usedPorts(excludeId) {
  const used = new Set();
  for (const s of db.data.servers) {
    if (s.id === excludeId) continue;
    used.add(s.ports.game);
    if (s.game === 'ase') { used.add(s.ports.game + 1); used.add(s.ports.query); }
    used.add(s.ports.rcon);
  }
  return used;
}

export function suggestPorts(game, excludeId) {
  const used = usedPorts(excludeId);
  const st = settings();
  const take = (start, span = 1) => {
    let p = start;
    while ([...Array(span).keys()].some((i) => used.has(p + i))) p += 1;
    for (let i = 0; i < span; i++) used.add(p + i);
    return p;
  };
  return {
    game: take(st.basePort, game === 'ase' ? 2 : 1),
    query: game === 'ase' ? take(st.baseQueryPort) : null,
    rcon: take(st.baseRconPort),
  };
}

function validatePorts(ports, game, excludeId) {
  const out = {
    game: Number(ports?.game),
    query: game === 'ase' ? Number(ports?.query) : null,
    rcon: Number(ports?.rcon),
  };
  const list = [['Game port', out.game], ['RCON port', out.rcon]];
  if (game === 'ase') list.push(['Query port', out.query]);
  for (const [label, p] of list) {
    if (!Number.isInteger(p) || p < 1024 || p > 65535) throw badRequest(`${label} must be between 1024 and 65535`);
  }
  const own = [out.game, out.rcon, ...(game === 'ase' ? [out.game + 1, out.query] : [])];
  if (new Set(own).size !== own.length) throw badRequest('Ports of this server overlap each other (ASE also uses game port + 1)');
  const used = usedPorts(excludeId);
  for (const p of own) {
    if (used.has(p)) {
      const other = db.data.servers.find((s) => s.id !== excludeId && [s.ports.game, s.ports.rcon, s.ports.query, s.game === 'ase' ? s.ports.game + 1 : null].includes(p));
      throw badRequest(`Port ${p} is already used by server "${other?.name || 'another server'}"`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Create / update / delete                                             */
/* ------------------------------------------------------------------ */

const str = (v, max = 200) => String(v ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, max);
const randomPassword = () => crypto.randomBytes(9).toString('base64url');

function cleanMods(mods) {
  if (!Array.isArray(mods)) return [];
  const seen = new Set();
  const out = [];
  for (const m of mods) {
    const id = str(typeof m === 'object' ? m.id : m, 20);
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: str(m?.name, 100), enabled: m?.enabled !== false });
  }
  return out;
}

function applyEditableFields(server, input, { creating = false } = {}) {
  const game = GAMES[server.game];
  if (input.name !== undefined || creating) {
    server.name = str(input.name, 64);
    if (!server.name) throw badRequest('Name is required');
  }
  if (input.map !== undefined || creating) {
    const map = str(input.map, 64) || game.maps[0].id;
    if (!/^[\w.-]+$/.test(map)) throw badRequest('Invalid map name');
    server.map = map;
  }
  if (input.sessionName !== undefined || creating) {
    server.sessionName = (str(input.sessionName, 100) || server.name).replace(/[?"]/g, '');
  }
  if (input.maxPlayers !== undefined || creating) {
    const mp = Number(input.maxPlayers ?? game.defaultMaxPlayers);
    if (!Number.isInteger(mp) || mp < 1 || mp > 255) throw badRequest('Max players must be between 1 and 255');
    server.maxPlayers = mp;
  }
  if (input.serverPassword !== undefined) server.serverPassword = str(input.serverPassword, 64);
  if (input.adminPassword !== undefined) {
    const ap = str(input.adminPassword, 64);
    if (!ap && !creating) throw badRequest('Admin password cannot be empty (it is needed for RCON)');
    if (/[?\s"]/.test(ap)) throw badRequest('Admin password cannot contain spaces, quotes or "?"');
    server.adminPassword = ap || randomPassword();
  }
  if (input.clusterId !== undefined) {
    if (input.clusterId) {
      const c = getCluster(input.clusterId);
      if (!c) throw badRequest('Cluster not found');
      if (c.game !== server.game) throw badRequest(`Cluster "${c.name}" is for ${GAMES[c.game].short} servers`);
      server.clusterId = c.id;
    } else server.clusterId = null;
  }
  if (input.mods !== undefined) server.mods = cleanMods(input.mods);
  for (const key of ['battleye', 'crossplay', 'autoStart', 'autoRestart', 'autoUpdate', 'virtualDisplay']) {
    if (input[key] !== undefined) server[key] = !!input[key];
  }
  if (input.extraArgs !== undefined) server.extraArgs = str(input.extraArgs, 1000);
  if (input.extraUrlParams !== undefined) server.extraUrlParams = str(input.extraUrlParams, 1000);
  if (input.motd !== undefined) server.motd = str(input.motd, 1000);
  if (input.motdDuration !== undefined) server.motdDuration = Math.max(5, Math.min(600, Number(input.motdDuration) || 30));
  if (input.ports !== undefined) server.ports = validatePorts(input.ports, server.game, server.id);
}

export function createServer(input) {
  const game = GAMES[input.game];
  if (!game) throw badRequest('Unknown game');
  const server = {
    id: newId(),
    game: game.id,
    serverPassword: '',
    clusterId: null,
    mods: [],
    battleye: false,
    crossplay: game.id === 'asa',
    extraArgs: '',
    extraUrlParams: '',
    autoStart: false,
    autoRestart: true,
    autoUpdate: false,
    motd: '',
    motdDuration: 30,
    iniOverrides: {},
    pendingIniRemovals: [],
    installed: false,
    buildId: null,
    latestBuildId: null,
    updateAvailable: false,
    desiredRunning: false,
    createdAt: new Date().toISOString(),
  };
  applyEditableFields(server, { adminPassword: '', ...input, ports: input.ports || suggestPorts(game.id) }, { creating: true });
  fs.mkdirSync(serverDir(server.id), { recursive: true });
  db.data.servers.push(server);
  db.save();
  trackServer(server);
  log(server.id, `Server "${server.name}" created (${game.name}, map ${server.map}).`);
  if (input.install !== false) installServer(server.id).catch(() => {});
  return server;
}

export function updateServer(id, input) {
  const server = getServer(id);
  if (!server) throw notFound('Server not found');
  const copy = structuredClone(server);
  applyEditableFields(copy, input);
  Object.assign(server, copy);
  db.save();
  return server;
}

export async function deleteServer(id, { deleteBackups = false } = {}) {
  const server = getServer(id);
  if (!server) throw notFound('Server not found');
  const r = rt(id);
  if (isAlive(id) || ['starting', 'stopping', 'running'].includes(r.state)) throw conflict('Stop the server before deleting it');
  if (r.job) throw conflict(`Server is busy (${r.job.type})`);
  r.job = { type: 'delete', label: 'Deleting files', progress: null };
  try {
    await fs.promises.rm(serverDir(id), { recursive: true, force: true });
    await fs.promises.rm(prefixDir(id), { recursive: true, force: true });
    for (const f of [consoleLogFile(id), `${consoleLogFile(id)}.1`]) await fs.promises.rm(f, { force: true });
    if (deleteBackups) await fs.promises.rm(path.join(paths.backups, id), { recursive: true, force: true });
  } finally {
    r.job = null;
  }
  db.data.servers = db.data.servers.filter((s) => s.id !== id);
  db.data.schedules = db.data.schedules.filter((s) => !(s.targetType === 'server' && s.targetId === id));
  db.save();
  hub.untrack(id);
  runtime.delete(id);
}

/* ------------------------------------------------------------------ */
/* INI management                                                       */
/* ------------------------------------------------------------------ */

export function applyManagedIni(server) {
  const files = {
    'GameUserSettings.ini': configPath(serverDir(server.id), server, 'GameUserSettings.ini'),
    'Game.ini': configPath(serverDir(server.id), server, 'Game.ini'),
  };
  fs.mkdirSync(path.dirname(files['Game.ini']), { recursive: true });
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

  const changes = { 'GameUserSettings.ini': {}, 'Game.ini': {} };
  const put = (file, section, key, value) => {
    changes[file][section] ||= {};
    changes[file][section][key] = value;
  };
  for (const [file, section, key] of server.pendingIniRemovals || []) put(file, section, key, null);
  for (const [section, entries] of Object.entries(managedGusValues(server))) {
    for (const [k, v] of Object.entries(entries)) put('GameUserSettings.ini', section, k, v);
  }
  for (const [file, sections] of Object.entries(server.iniOverrides || {})) {
    if (!changes[file]) continue;
    for (const [section, entries] of Object.entries(sections)) {
      for (const [k, v] of Object.entries(entries)) put(file, section, k, v);
    }
  }
  for (const [file, sections] of Object.entries(changes)) {
    let text = read(files[file]);
    const before = text;
    for (const [section, entries] of Object.entries(sections)) text = setIniValues(text, section, entries);
    if (text !== before) fs.writeFileSync(files[file], text);
  }
  server.pendingIniRemovals = [];
  db.save();
}

/* ------------------------------------------------------------------ */
/* RCON                                                                 */
/* ------------------------------------------------------------------ */

export function rcon(id, command, timeout = 8000) {
  const server = getServer(id);
  if (!server) return Promise.reject(notFound('Server not found'));
  const launched = rt(id).launched;
  return rconCommand({
    port: launched?.rconPort || server.ports.rcon,
    password: launched?.adminPassword || server.adminPassword,
    command,
    timeout,
  });
}

export async function sendCommand(id, command) {
  const server = getServer(id);
  if (!server) throw notFound('Server not found');
  const cmd = str(command, 500);
  if (!cmd) throw badRequest('Command is empty');
  if (!isAlive(id)) throw conflict('Server is not running');
  log(id, `> ${cmd}`, 'RCON');
  try {
    const res = await rcon(id, cmd);
    const text = res.trim() || '(no response)';
    log(id, text, 'RCON');
    return text;
  } catch (err) {
    log(id, `Error: ${err.message}`, 'RCON');
    throw badRequest(err.message);
  }
}

export async function broadcast(id, message) {
  try { await rcon(id, `Broadcast ${message}`, 5000); } catch { /* ignore */ }
  try { await rcon(id, `ServerChat ${message}`, 5000); } catch { /* ignore */ }
}

/** Broadcast a countdown ("Server restarting in X minutes") and wait until it is over. */
export async function countdown(id, minutes, verb) {
  minutes = Math.floor(Number(minutes) || 0);
  if (minutes <= 0 || rt(id).state !== 'running') return;
  const r = rt(id);
  const points = [...new Set([minutes, ...[60, 30, 15, 10, 5, 3, 2, 1].filter((s) => s < minutes)])].sort((a, b) => b - a);
  r.countdown = { verb, endsAt: Date.now() + minutes * 60000 };
  log(id, `Countdown started: server ${verb} in ${minutes} minute(s).`);
  try {
    for (let i = 0; i < points.length; i++) {
      if (!isAlive(id)) return;
      const p = points[i];
      await broadcast(id, `Server ${verb} in ${p} minute${p > 1 ? 's' : ''}.`);
      await sleep((p - (points[i + 1] ?? 0)) * 60000);
    }
    await broadcast(id, `Server ${verb} now!`);
    await sleep(3000);
  } finally {
    r.countdown = null;
  }
}

/* ------------------------------------------------------------------ */
/* Start / stop                                                         */
/* ------------------------------------------------------------------ */

function startChecks(id) {
  const server = getServer(id);
  if (!server) throw notFound('Server not found');
  const r = rt(id);
  if (r.job) throw conflict(`Server is busy (${r.job.label || r.job.type})`);
  if (isAlive(id) || ['starting', 'running', 'stopping'].includes(r.state)) throw conflict('Server is already running');
  if (!server.installed) throw badRequest('Server is not installed yet. Click "Install" first.');
  if (!config.isLinux) throw badRequest('Game servers can only be started on a Linux host.');
  return server;
}

async function doStart(server) {
  const id = server.id;
  const r = rt(id);
  const game = gameOf(server);
  const dir = serverDir(id);
  r.state = 'starting';
  r.lastError = null;
  r.players = [];
  r.rconOk = false;
  r.rconError = null;
  r.startedAt = Date.now();
  r.launching = true;
  try {
    if (!fs.existsSync(path.join(dir, game.binary))) throw new Error(`Game binary not found (${game.binary}). Try "Validate files".`);
    let proton = null;
    if (server.game === 'asa') {
      if (!protonDir()) log(id, `GE-Proton ${RECOMMENDED_PROTON} is not installed yet, downloading it first...`);
      proton = await ensureProton((m) => log(id, m, 'Proton'));
      const version = path.basename(proton);
      // A Wine prefix made by another Proton version can break the server: rebuild it.
      // It only holds Wine's own files; saves and configs live in the server folder.
      if (server.protonUsed !== version && fs.existsSync(prefixDir(id))) {
        log(id, `Proton version changed (${server.protonUsed || 'unknown'} -> ${version}), rebuilding the Wine prefix...`);
        await fs.promises.rm(prefixDir(id), { recursive: true, force: true });
      }
      server.protonUsed = version;
      log(id, `Using ${version}.`);
      fs.mkdirSync(prefixDir(id), { recursive: true });
    }
    let cluster = null;
    if (server.clusterId) {
      cluster = getCluster(server.clusterId);
      if (cluster) fs.mkdirSync(clusterDir(cluster.id), { recursive: true });
    }
    applyManagedIni(server);
    if (server.game === 'ase' && (server.mods || []).some((m) => m.enabled !== false)) ensureAseModTools(dir);

    hub.rotate(id);
    // Virtual display is an opt-in fallback (Server settings → Advanced).
    let xvfbRun = null;
    if (server.game === 'asa' && server.virtualDisplay) {
      xvfbRun = ['/usr/bin/xvfb-run', '/bin/xvfb-run'].find((p) => fs.existsSync(p)) || null;
      if (!xvfbRun) log(id, 'Warning: "Virtual display" is on but xvfb is not installed (sudo apt install xvfb xauth). Starting without it.');
    }
    const launch = buildLaunch(server, {
      installDir: dir,
      cluster,
      clusterDir: cluster ? clusterDir(cluster.id) : null,
      protonDir: proton,
      prefixDir: prefixDir(id),
      steamClientDir: paths.steamClient,
      xvfbRun,
    });
    log(id, `Starting ${game.short} server "${server.name}" on map ${mapName(server)}...`);
    log(id, `Launch: ${path.basename(launch.cmd)} ${launch.args.join(' ')}`);
    if (server.game === 'asa') log(id, 'ARK: Survival Ascended can take several minutes to start (longer on the very first start).');

    const out = fs.openSync(consoleLogFile(id), 'a');
    const env = { ...process.env, ...launch.env, ARKPANEL_SERVER_ID: id };
    const child = spawn('/bin/bash', ['-c', 'ulimit -n 100000 2>/dev/null; exec "$0" "$@"', launch.cmd, ...launch.args], {
      cwd: launch.cwd,
      env,
      detached: true,
      stdio: ['ignore', out, out],
    });
    fs.closeSync(out);
    child.on('error', (err) => log(id, `Failed to launch: ${err.message}`));
    child.on('exit', (code, signal) => {
      log(id, `Server process exited (code ${code ?? '-'}${signal ? `, signal ${signal}` : ''}).`);
      if (r.child === child) r.child = null;
      setTimeout(tick, 1500);
    });
    child.unref();
    r.child = child;
    r.pids = [child.pid];
    r.launched = { rconPort: server.ports.rcon, adminPassword: server.adminPassword };
    server.desiredRunning = true;
    server.lastStartedAt = new Date().toISOString();
    db.save();
  } catch (err) {
    r.state = 'stopped';
    r.startedAt = null;
    r.lastError = err.message;
    log(id, `Start failed: ${err.message}`);
    throw err;
  } finally {
    r.launching = false;
  }
}

/** Start a server. Validation errors throw synchronously; the rest runs in the background. */
export function startServer(id) {
  const server = startChecks(id);
  rt(id).state = 'starting';
  return doStart(server).catch(() => {});
}

async function doStop(server, { warnMinutes = 0, verb = 'shutting down' } = {}) {
  const id = server.id;
  const r = rt(id);
  if (warnMinutes > 0) await countdown(id, warnMinutes, verb);
  r.state = 'stopping';
  server.desiredRunning = false;
  db.save();
  log(id, 'Stopping server...');
  let graceful = false;
  try {
    await rcon(id, 'SaveWorld', 60000);
    log(id, 'World saved.');
    await sleep(2000);
    await rcon(id, 'DoExit', 10000).catch(() => {});
    graceful = true;
  } catch (err) {
    log(id, `RCON not reachable (${err.message}), terminating the process instead.`);
  }
  const timeout = graceful ? (settings().stopTimeoutSeconds || 120) * 1000 : 2000;
  if (!(await waitForExit(id, timeout))) {
    log(id, 'Server did not exit in time, sending SIGTERM...');
    killPids(currentPids(id), 'SIGTERM');
    if (!(await waitForExit(id, 20000))) {
      log(id, 'Still running, sending SIGKILL...');
      killPids(currentPids(id), 'SIGKILL');
      await waitForExit(id, 10000);
    }
  }
  r.state = 'stopped';
  r.players = [];
  r.pids = [];
  r.startedAt = null;
  r.launched = null;
  log(id, 'Server stopped.');
}

function stopChecks(id) {
  const server = getServer(id);
  if (!server) throw notFound('Server not found');
  const r = rt(id);
  if (r.state === 'stopping') throw conflict('Server is already stopping');
  if (r.countdown) throw conflict('A countdown is already running for this server');
  return server;
}

export function stopServer(id, opts = {}) {
  const server = stopChecks(id);
  const r = rt(id);
  if (!isAlive(id) && r.state !== 'starting') {
    r.state = 'stopped';
    server.desiredRunning = false;
    db.save();
    return Promise.resolve();
  }
  return doStop(server, opts).catch((err) => log(id, `Stop failed: ${err.message}`));
}

export function restartServer(id, { warnMinutes = 0 } = {}) {
  const server = stopChecks(id);
  if (!server.installed) throw badRequest('Server is not installed yet');
  const r = rt(id);
  return (async () => {
    if (isAlive(id) || r.state === 'starting') await doStop(server, { warnMinutes, verb: 'restarting' });
    await sleep(2000);
    await doStart(server);
  })().catch((err) => log(id, `Restart failed: ${err.message}`));
}

export async function killServer(id) {
  const server = getServer(id);
  if (!server) throw notFound('Server not found');
  const r = rt(id);
  r.state = 'stopping';
  server.desiredRunning = false;
  db.save();
  log(id, 'Killing server process (no save)...');
  killPids(currentPids(id), 'SIGKILL');
  if (!config.isLinux && r.child) r.child.kill('SIGKILL');
  await waitForExit(id, 10000);
  r.state = 'stopped';
  r.players = [];
  r.startedAt = null;
  log(id, 'Server killed.');
}

/* ------------------------------------------------------------------ */
/* Install / update                                                     */
/* ------------------------------------------------------------------ */

function ensureAseModTools(dir) {
  const target = path.join(dir, 'Engine/Binaries/ThirdParty/SteamCMD/Linux');
  if (fs.existsSync(path.join(target, 'steamcmd.sh'))) return;
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(paths.steamcmd, 'steamcmd.sh'), path.join(target, 'steamcmd.sh'));
  fs.cpSync(path.join(paths.steamcmd, 'linux32'), path.join(target, 'linux32'), { recursive: true });
}

async function doInstall(server, { validate = false } = {}) {
  const id = server.id;
  const r = rt(id);
  const game = gameOf(server);
  const dir = serverDir(id);
  fs.mkdirSync(dir, { recursive: true });
  await ensureSteamcmd((m) => log(id, m, 'SteamCMD'));

  if (!fs.existsSync(path.join(dir, game.binary))) {
    // Copy game files from another installed server of the same game to avoid a full re-download.
    const source = db.data.servers.find((s) => s.id !== id && s.game === server.game && s.installed && fs.existsSync(path.join(serverDir(s.id), game.binary)));
    if (source) {
      r.job.label = `Copying files from "${source.name}"`;
      log(id, `Copying game files from "${source.name}" to save a full download...`);
      const res = await runCommand('rsync', ['-a', '--exclude', 'ShooterGame/Saved/', `${serverDir(source.id)}/`, `${dir}/`], { onLine: (l) => log(id, l, 'rsync') });
      if (res.code !== 0) log(id, `Copy failed (rsync exit ${res.code}), falling back to a normal download.`);
      validate = true;
    }
  }

  r.job.label = 'Connecting to Steam';
  r.job.progress = 0;
  log(id, `Running SteamCMD app_update ${game.appId}${validate ? ' (validate)' : ''}. This can take a while...`);
  let lastLogged = -5;
  await steamAppUpdate({
    appId: game.appId,
    dir,
    windows: game.windowsOnly,
    validate,
    onLine: (line) => {
      const m = /progress: ([\d.]+)/.exec(line);
      if (m) {
        const pct = Number(m[1]);
        if (pct < lastLogged || pct - lastLogged >= 5) { lastLogged = pct; log(id, line, 'SteamCMD'); }
        return;
      }
      log(id, line, 'SteamCMD');
    },
    onProgress: (pct, label) => {
      r.job.progress = pct;
      r.job.label = label.charAt(0).toUpperCase() + label.slice(1);
    },
  });
  server.installed = true;
  server.buildId = installedBuildId(dir, game.appId);
  server.updateAvailable = !!(server.latestBuildId && server.buildId && server.latestBuildId !== server.buildId);
  db.save();
  log(id, `Game files are up to date (build ${server.buildId || 'unknown'}).`);
}

/** Install (or validate) game files. Runs in the background. */
export function installServer(id, { validate = false } = {}) {
  const server = getServer(id);
  if (!server) throw notFound('Server not found');
  const r = rt(id);
  if (r.job) throw conflict(`Server is busy (${r.job.label || r.job.type})`);
  if (isAlive(id) || ['starting', 'running', 'stopping'].includes(r.state)) throw conflict('Stop the server first');
  if (!config.isLinux) throw badRequest('Installing game servers is only supported on a Linux host.');
  r.job = { type: server.installed ? (validate ? 'validate' : 'update') : 'install', label: 'Preparing', progress: null };
  r.lastError = null;
  return doInstall(server, { validate })
    .catch((err) => { r.lastError = err.message; log(id, `Install failed: ${err.message}`); })
    .finally(() => { r.job = null; });
}

/** Update a server: (countdown) -> stop -> update -> start again if it was running. */
export function updateGame(id, { warnMinutes = 0, validate = false } = {}) {
  const server = getServer(id);
  if (!server) throw notFound('Server not found');
  if (!server.installed) throw badRequest('Server is not installed yet');
  const r = rt(id);
  if (r.job) throw conflict(`Server is busy (${r.job.label || r.job.type})`);
  if (!config.isLinux) throw badRequest('Updating is only supported on a Linux host.');
  const wasRunning = isAlive(id) || r.state === 'starting';
  r.job = { type: 'update', label: wasRunning ? 'Stopping server' : 'Preparing', progress: null };
  return (async () => {
    if (wasRunning) await doStop(server, { warnMinutes, verb: 'updating' });
    await doInstall(server, { validate });
    r.job = null;
    if (wasRunning) await doStart(server);
  })()
    .catch((err) => { r.lastError = err.message; log(id, `Update failed: ${err.message}`); })
    .finally(() => { if (r.job?.type === 'update') r.job = null; });
}

let checkingUpdates = false;
export async function checkUpdates({ auto = true } = {}) {
  if (checkingUpdates || !config.isLinux) return;
  checkingUpdates = true;
  try {
    const games = [...new Set(db.data.servers.filter((s) => s.installed).map((s) => s.game))];
    for (const g of games) {
      const latest = await latestBuildId(GAMES[g].appId, { force: true }).catch(() => null);
      if (!latest) continue;
      for (const s of db.data.servers.filter((x) => x.game === g && x.installed)) {
        s.latestBuildId = latest;
        s.updateAvailable = !!(s.buildId && latest !== s.buildId);
        if (auto && s.updateAvailable && s.autoUpdate && !rt(s.id).job && !rt(s.id).countdown) {
          log(s.id, `Update available (build ${s.buildId} -> ${latest}), auto-updating...`);
          try { updateGame(s.id, { warnMinutes: isAlive(s.id) ? 5 : 0 }); } catch (err) { log(s.id, `Auto-update skipped: ${err.message}`); }
        }
      }
    }
    db.data.lastUpdateCheck = new Date().toISOString();
    db.save();
  } finally {
    checkingUpdates = false;
  }
}

/* ------------------------------------------------------------------ */
/* Monitoring                                                           */
/* ------------------------------------------------------------------ */

function handleUnexpectedExit(server) {
  const id = server.id;
  const r = rt(id);
  r.players = [];
  r.startedAt = null;
  r.launched = null;
  if (!server.desiredRunning) { r.state = 'stopped'; return; }
  r.state = 'crashed';
  log(id, 'The server stopped unexpectedly (crash or in-game shutdown).');
  if (server.autoRestart) {
    const now = Date.now();
    r.crashTimes = r.crashTimes.filter((t) => now - t < 30 * 60000);
    r.crashTimes.push(now);
    if (r.crashTimes.length > 4) {
      log(id, 'Server crashed 5 times within 30 minutes. Auto-restart paused until you start it manually.');
      server.desiredRunning = false;
      db.save();
      return;
    }
    log(id, 'Auto-restart enabled: restarting in 15 seconds...');
    setTimeout(() => {
      if (rt(id).state !== 'crashed' || !getServer(id)?.desiredRunning) return;
      try { startServer(id); } catch (err) { log(id, `Auto-restart failed: ${err.message}`); }
    }, 15000);
  } else {
    server.desiredRunning = false;
    db.save();
  }
}

async function pollRcon(server) {
  const r = rt(server.id);
  const interval = r.state === 'starting' ? 5000 : 30000;
  if (Date.now() - r.lastPoll < interval) return;
  r.lastPoll = Date.now();
  try {
    const res = await rcon(server.id, 'ListPlayers', 4000);
    r.players = parsePlayers(res);
    r.playersAt = Date.now();
    r.rconOk = true;
    r.rconError = null;
    if (r.state === 'starting') {
      r.state = 'running';
      log(server.id, 'Server is online and accepting connections.');
    }
  } catch (err) {
    r.rconOk = false;
    if (r.rconError !== err.message && /authentication/i.test(err.message)) log(server.id, `RCON: ${err.message}`);
    r.rconError = err.message;
  }
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const procs = config.isLinux ? scanTaggedProcesses() : new Map();
    const now = Date.now();
    for (const server of db.data.servers) {
      const r = rt(server.id);
      const pids = config.isLinux ? procs.get(server.id) || [] : currentPids(server.id);
      r.pids = pids;
      if (pids.length) {
        const usage = processUsage(pids);
        r.cpu = cpuPercent(server.id, usage.ticks);
        r.memory = usage.rss;
        if (r.state === 'stopped' || r.state === 'crashed') {
          r.state = 'starting';
          r.startedAt ||= now;
        }
        if (r.state === 'starting' || r.state === 'running') pollRcon(server);
      } else {
        r.cpu = 0;
        r.memory = 0;
        if ((r.state === 'starting' && !r.launching && !r.child) || r.state === 'running') {
          handleUnexpectedExit(server);
        }
      }
      if (now - r.lastSample >= 15000) {
        r.lastSample = now;
        r.history.push({ t: now, cpu: Math.round(r.cpu * 10) / 10, mem: r.memory, players: r.players.length });
        if (r.history.length > 120) r.history.shift();
      }
    }
  } finally {
    ticking = false;
  }
}

function trackServer(server) {
  hub.track(server);
  hub.subscribe(server.id, (entries) => {
    const r = rt(server.id);
    if (r.state !== 'starting') return;
    if (entries.some((e) => e.s === 'game' && /has successfully started/i.test(e.m))) {
      r.state = 'running';
      log(server.id, 'Server reported a successful start.');
    }
  });
}

export async function initServers() {
  for (const server of db.data.servers) trackServer(server);
  await tick();
  for (const server of db.data.servers) {
    if (isAlive(server.id)) log(server.id, 'Panel started and re-attached to the running server.');
  }
  setInterval(tick, 4000).unref();

  // Autostart (staggered so several ASA servers don't all hit the disk at once)
  let delay = 3000;
  for (const server of db.data.servers) {
    if (!server.autoStart || !server.installed || isAlive(server.id)) continue;
    setTimeout(() => {
      try {
        log(server.id, 'Autostart: starting server.');
        startServer(server.id);
      } catch (err) { log(server.id, `Autostart failed: ${err.message}`); }
    }, delay);
    delay += 30000;
  }

  const scheduleUpdateCheck = () => {
    const minutes = Math.max(10, Number(settings().updateCheckMinutes) || 60);
    setTimeout(async () => {
      await checkUpdates().catch((err) => console.error('[updates]', err.message));
      scheduleUpdateCheck();
    }, minutes * 60000).unref();
  };
  setTimeout(() => checkUpdates().catch(() => {}), 90000).unref();
  scheduleUpdateCheck();
}

/** Called on panel shutdown: game servers keep running on purpose. */
export function shutdownHook() {
  for (const r of runtime.values()) r.child?.unref?.();
}

/* ------------------------------------------------------------------ */
/* Serialisation for the API                                            */
/* ------------------------------------------------------------------ */

export function publicServer(server, { full = false } = {}) {
  const r = rt(server.id);
  const cluster = server.clusterId ? getCluster(server.clusterId) : null;
  const ip = settings().publicIp || publicIp();
  return {
    ...server,
    gameName: GAMES[server.game].name,
    gameShort: GAMES[server.game].short,
    mapName: mapName(server),
    cluster: cluster ? { id: cluster.id, name: cluster.name } : null,
    connect: ip ? `${ip}:${server.ports.game}` : null,
    runtime: {
      state: r.state,
      job: r.job,
      countdown: r.countdown,
      cpu: r.cpu,
      memory: r.memory,
      players: r.players,
      playerCount: r.players.length,
      rconOk: r.rconOk,
      rconError: r.rconError,
      startedAt: r.startedAt,
      lastError: r.lastError,
      processes: r.pids.length,
      ...(full ? { history: r.history } : {}),
    },
  };
}
