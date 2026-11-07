import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { paths, config } from './config.js';
import { db, settings } from './db.js';
import { mustRun, runCommand } from './util/exec.js';

const STEAMCMD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';
const PROTON_RELEASES = 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest';

export const steamcmdBin = () => path.join(paths.steamcmd, 'steamcmd.sh');
export const steamcmdInstalled = () => fs.existsSync(steamcmdBin());

/* ---------- simple async mutex so only one SteamCMD runs at a time ---------- */
let steamQueue = Promise.resolve();
let steamQueueLength = 0;
function withSteamLock(fn) {
  steamQueueLength++;
  const run = steamQueue.then(fn, fn);
  steamQueue = run.catch(() => {}).finally(() => { steamQueueLength--; });
  return run;
}
export const steamcmdQueueLength = () => steamQueueLength;

async function download(url, dest, log) {
  const res = await fetch(url, { headers: { 'User-Agent': 'arkpanel' } });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  let lastPct = -10;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    received += chunk.length;
    if (total && log) {
      const pct = Math.floor((received / total) * 100);
      if (pct >= lastPct + 10) { lastPct = pct; log(`Downloading... ${pct}%`); }
    }
  });
  await pipeline(body, fs.createWriteStream(dest));
}

export async function installSteamcmd(log = console.log) {
  fs.mkdirSync(paths.steamcmd, { recursive: true });
  const tmp = path.join(paths.tmp, 'steamcmd_linux.tar.gz');
  log('Downloading SteamCMD...');
  await download(STEAMCMD_URL, tmp, log);
  await mustRun('tar', ['-xzf', tmp, '-C', paths.steamcmd]);
  fs.rmSync(tmp, { force: true });
  log('Updating SteamCMD (first run)...');
  const res = await withSteamLock(() => runCommand(steamcmdBin(), ['+quit'], { cwd: paths.steamcmd, onLine: log }));
  if (res.code !== 0 && res.code !== 7) {
    // keep the files, but report clearly: usually the 32-bit libraries are missing
    if (/required file not found|No such file or directory|cannot execute/i.test(res.output)) {
      throw new Error('SteamCMD cannot run: 32-bit libraries are missing. Run: sudo dpkg --add-architecture i386 && sudo apt update && sudo apt install lib32gcc-s1 lib32stdc++6');
    }
    throw new Error(`SteamCMD first run failed (exit code ${res.code})`);
  }
  log('SteamCMD is ready.');
}

export async function ensureSteamcmd(log) {
  if (!config.isLinux) throw new Error('SteamCMD is only supported on Linux hosts.');
  if (!steamcmdInstalled()) await installSteamcmd(log);
}

/**
 * Run SteamCMD with the given arguments (serialised through the lock).
 * onProgress receives (percent, label) when SteamCMD prints progress lines.
 */
export function runSteamcmd(args, { onLine, onProgress } = {}) {
  return withSteamLock(async () => {
    const res = await runCommand(steamcmdBin(), args, {
      cwd: paths.steamcmd,
      env: { HOME: process.env.HOME || paths.tools },
      onLine: (line) => {
        const m = /Update state \(0x[0-9a-f]+\) ([a-z ]+), progress: ([\d.]+)/i.exec(line);
        if (m) onProgress?.(Number(m[2]), m[1].trim());
        onLine?.(line);
      },
    });
    return res;
  });
}

/** Install or update an app into a directory. Retries once, since SteamCMD sometimes fails on the first try. */
export async function steamAppUpdate({ appId, dir, windows, validate, onLine, onProgress }) {
  const args = [];
  if (windows) args.push('+@sSteamCmdForcePlatformType', 'windows');
  args.push('+force_install_dir', dir, '+login', 'anonymous', '+app_update', appId);
  if (validate) args.push('validate');
  args.push('+quit');
  let lastOutput = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await runSteamcmd(args, { onLine, onProgress });
    lastOutput = res.output;
    if (res.code === 0 && /Success! App '\d+' (fully installed|already up to date)/i.test(res.output)) return;
    if (res.code === 0 && fs.existsSync(path.join(dir, 'steamapps', `appmanifest_${appId}.acf`)) && !/ERROR!/i.test(res.output)) return;
    onLine?.(`SteamCMD attempt ${attempt} failed (exit code ${res.code}).${attempt < 3 ? ' Retrying...' : ''}`);
  }
  throw new Error(`SteamCMD failed: ${lastOutput.split('\n').filter((l) => /error/i.test(l)).slice(-2).join(' | ') || 'see console'}`);
}

export function installedBuildId(dir, appId) {
  try {
    const text = fs.readFileSync(path.join(dir, 'steamapps', `appmanifest_${appId}.acf`), 'utf8');
    return (/"buildid"\s+"(\d+)"/.exec(text) || [])[1] || null;
  } catch {
    return null;
  }
}

const latestCache = new Map();
/** Ask Steam for the newest public build id of an app (cached for 5 minutes). */
export async function latestBuildId(appId, { force = false } = {}) {
  const cached = latestCache.get(appId);
  if (!force && cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.buildId;
  if (!steamcmdInstalled()) return null;
  // SteamCMD caches app info aggressively; drop the cache so we get fresh data.
  fs.rmSync(path.join(paths.steamcmd, 'appcache', 'appinfo.vdf'), { force: true });
  const res = await runSteamcmd(['+login', 'anonymous', '+app_info_update', '1', '+app_info_print', appId, '+quit']);
  const m = /"branches"[\s\S]*?"public"\s*\{[\s\S]*?"buildid"\s*"(\d+)"/.exec(res.output);
  const buildId = m ? m[1] : null;
  if (buildId) latestCache.set(appId, { buildId, at: Date.now() });
  return buildId;
}

/* ------------------------------- Proton ------------------------------- */

export function protonVersions() {
  try {
    return fs.readdirSync(paths.proton, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(paths.proton, d.name, 'proton')))
      .map((d) => d.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

/**
 * Known-good GE-Proton build for the ASA dedicated server.
 * GE-Proton 11.x hangs ArkAscendedServer.exe before it writes any log line, while
 * 10-34 starts normally on the same files, so we pin it instead of using "latest".
 */
export const RECOMMENDED_PROTON = 'GE-Proton10-34';

export function activeProton() {
  const versions = protonVersions();
  const chosen = settings().activeProton;
  if (chosen && versions.includes(chosen)) return chosen;
  if (versions.includes(RECOMMENDED_PROTON)) return RECOMMENDED_PROTON;
  return null; // ensureProton() installs the recommended version
}

export const protonDir = (version = activeProton()) => (version ? path.join(paths.proton, version) : null);

async function installProtonAsset(name, url, sizeHint, log) {
  if (protonVersions().includes(name)) {
    log(`${name} is already installed.`);
    return name;
  }
  const tmp = path.join(paths.tmp, `${name}.tar.gz`);
  log(`Downloading ${name}${sizeHint ? ` (${Math.round(sizeHint / 1024 / 1024)} MB)` : ''}...`);
  await download(url, tmp, log);
  log('Extracting...');
  const before = new Set(protonVersions());
  await mustRun('tar', ['-xzf', tmp, '-C', paths.proton]);
  fs.rmSync(tmp, { force: true });
  // the folder inside the archive may be named slightly differently than the asset
  const added = protonVersions().find((v) => !before.has(v)) || name;
  log(`${added} installed.`);
  return added;
}

let protonInstalling = null;
function once(fn) {
  if (protonInstalling) return protonInstalling;
  protonInstalling = fn().finally(() => { protonInstalling = null; });
  return protonInstalling;
}

/** Install the pinned, known-good version and make it active. */
export function installRecommendedProton(log = console.log) {
  return once(async () => {
    const url = `https://github.com/GloriousEggroll/proton-ge-custom/releases/download/${RECOMMENDED_PROTON}/${RECOMMENDED_PROTON}.tar.gz`;
    const name = await installProtonAsset(RECOMMENDED_PROTON, url, 0, log);
    db.data.settings.activeProton = name;
    db.save();
    return name;
  });
}

/** Install the newest GE-Proton release (not activated automatically: newer is not always better for ASA). */
export function installLatestProton(log = console.log) {
  return once(async () => {
    log('Looking up the latest GE-Proton release...');
    const res = await fetch(PROTON_RELEASES, { headers: { 'User-Agent': 'arkpanel', Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const release = await res.json();
    // Releases also contain ARM builds (e.g. GE-Proton11-12-aarch64.tar.gz); we need the x86_64 one.
    const tarballs = release.assets.filter((a) => a.name.endsWith('.tar.gz'));
    const asset = tarballs.find((a) => /^GE-Proton[\d-]+\.tar\.gz$/.test(a.name))
      || tarballs.find((a) => !/aarch64|arm64/i.test(a.name));
    if (!asset) throw new Error('No x86_64 .tar.gz asset found in the latest GE-Proton release');
    const name = await installProtonAsset(asset.name.replace(/\.tar\.gz$/, ''), asset.browser_download_url, asset.size, log);
    log(`Installed but not activated. The recommended version for ASA is ${RECOMMENDED_PROTON}; switch under Settings → Tools if you want to try ${name}.`);
    return name;
  });
}

export async function ensureProton(log) {
  if (!activeProton()) await installRecommendedProton(log);
  fs.mkdirSync(paths.steamClient, { recursive: true });
  ensureSteamClientLinks(log);
  return protonDir();
}

/**
 * Proton's lsteamclient bridge needs the native Linux steamclient.so. Without it the ASA
 * server stops right after "ARK Version" (exit code 21). SteamCMD ships both builds; link
 * them where Proton looks: ~/.steam/sdk{32,64} and <STEAM_COMPAT_CLIENT_INSTALL_PATH>/linux{32,64}.
 */
export function ensureSteamClientLinks(log = () => {}) {
  const home = process.env.HOME || os.homedir();
  const pairs = [
    ['linux64', [path.join(home, '.steam', 'sdk64'), path.join(paths.steamClient, 'linux64')]],
    ['linux32', [path.join(home, '.steam', 'sdk32'), path.join(paths.steamClient, 'linux32')]],
  ];
  let missing = false;
  for (const [arch, targets] of pairs) {
    const src = path.join(paths.steamcmd, arch, 'steamclient.so');
    if (!fs.existsSync(src)) { missing = true; continue; }
    for (const dir of targets) {
      const link = path.join(dir, 'steamclient.so');
      try {
        fs.mkdirSync(dir, { recursive: true });
        let current = null;
        try { current = fs.readlinkSync(link); } catch { /* not a link */ }
        if (current === src) continue;
        fs.rmSync(link, { force: true });
        fs.symlinkSync(src, link);
      } catch (err) {
        log(`Could not link ${link}: ${err.message}`);
      }
    }
  }
  if (missing) log('Warning: SteamCMD has no steamclient.so yet (run "Reinstall SteamCMD" under Settings → Tools). The ASA server may exit right after start.');
}

export function removeProton(version) {
  if (!protonVersions().includes(version)) throw new Error('Unknown Proton version');
  fs.rmSync(path.join(paths.proton, version), { recursive: true, force: true });
  if (db.data.settings.activeProton === version) { db.data.settings.activeProton = ''; db.save(); }
}
