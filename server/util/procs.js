import fs from 'node:fs';
import os from 'node:os';
import { config } from '../config.js';

/**
 * Every game server process gets ARKPANEL_SERVER_ID=<id> in its environment.
 * Environment variables are inherited by all children (proton -> wine -> wineserver -> game),
 * so scanning /proc lets us find, measure and kill the whole process tree reliably,
 * even after the panel itself restarted.
 */
const TAG = 'ARKPANEL_SERVER_ID=';
const CLK_TCK = 100;
const PAGE = 4096;

export function scanTaggedProcesses() {
  const result = new Map();
  if (!config.isLinux) return result;
  let entries;
  try { entries = fs.readdirSync('/proc'); } catch { return result; }
  const myPid = String(process.pid);
  for (const pid of entries) {
    if (!/^\d+$/.test(pid) || pid === myPid) continue;
    let env;
    try { env = fs.readFileSync(`/proc/${pid}/environ`, 'latin1'); } catch { continue; }
    const at = env.indexOf(TAG);
    if (at === -1) continue;
    const end = env.indexOf('\0', at);
    const id = env.slice(at + TAG.length, end === -1 ? undefined : end);
    // skip zombies
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'latin1');
      const state = stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3);
      if (state === 'Z') continue;
    } catch { continue; }
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(Number(pid));
  }
  return result;
}

/** Sum CPU ticks and resident memory of a set of pids. */
export function processUsage(pids) {
  let ticks = 0;
  let rss = 0;
  for (const pid of pids) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'latin1');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      ticks += Number(fields[11]) + Number(fields[12]); // utime + stime
      const statm = fs.readFileSync(`/proc/${pid}/statm`, 'latin1').split(' ');
      rss += Number(statm[1]) * PAGE;
    } catch { /* process exited */ }
  }
  return { ticks, rss };
}

const cpuTrack = new Map();
/** CPU usage of a process group as a percentage of the whole host (0-100). */
export function cpuPercent(key, ticks) {
  const now = Date.now();
  const prev = cpuTrack.get(key);
  cpuTrack.set(key, { ticks, at: now });
  if (!prev || ticks < prev.ticks) return 0;
  const seconds = (now - prev.at) / 1000;
  if (seconds <= 0) return 0;
  const cores = os.cpus().length || 1;
  return Math.min(100, ((ticks - prev.ticks) / CLK_TCK / seconds / cores) * 100);
}

export function killPids(pids, signal) {
  for (const pid of pids) {
    try { process.kill(pid, signal); } catch { /* already gone */ }
  }
}

let lastHostCpu = null;
function hostCpuPercent() {
  if (config.isLinux) {
    try {
      const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
      const nums = line.trim().split(/\s+/).slice(1).map(Number);
      const idle = nums[3] + (nums[4] || 0);
      const total = nums.reduce((a, b) => a + b, 0);
      const prev = lastHostCpu;
      lastHostCpu = { idle, total };
      if (!prev) return 0;
      const dt = total - prev.total;
      return dt > 0 ? Math.max(0, Math.min(100, (1 - (idle - prev.idle) / dt) * 100)) : 0;
    } catch { /* fall through */ }
  }
  const cpus = os.cpus();
  const idle = cpus.reduce((a, c) => a + c.times.idle, 0);
  const total = cpus.reduce((a, c) => a + Object.values(c.times).reduce((x, y) => x + y, 0), 0);
  const prev = lastHostCpu;
  lastHostCpu = { idle, total };
  if (!prev) return 0;
  const dt = total - prev.total;
  return dt > 0 ? (1 - (idle - prev.idle) / dt) * 100 : 0;
}

function memInfo() {
  if (config.isLinux) {
    try {
      const text = fs.readFileSync('/proc/meminfo', 'utf8');
      const get = (k) => Number((new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(text) || [])[1] || 0) * 1024;
      const total = get('MemTotal');
      const available = get('MemAvailable');
      return { total, used: total - available, swapTotal: get('SwapTotal'), swapUsed: get('SwapTotal') - get('SwapFree') };
    } catch { /* fall through */ }
  }
  return { total: os.totalmem(), used: os.totalmem() - os.freemem(), swapTotal: 0, swapUsed: 0 };
}

function diskInfo(dir) {
  try {
    const s = fs.statfsSync(dir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, used: total - free, free };
  } catch {
    return { total: 0, used: 0, free: 0 };
  }
}

export function hostStats() {
  return {
    cpu: hostCpuPercent(),
    cores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'unknown',
    load: os.loadavg(),
    memory: memInfo(),
    disk: diskInfo(config.dataDir),
    uptime: os.uptime(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    time: new Date().toISOString(),
  };
}
