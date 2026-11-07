export function bytes(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function duration(ms) {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const txt = duration(Math.abs(diff));
  return future ? `in ${txt}` : `${txt} ago`;
}

export function dateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const pct = (v) => `${Math.round(v ?? 0)}%`;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');

/** Human readable description for the cron patterns the schedule editor produces. */
export function describeCron(cron) {
  const p = String(cron || '').trim().split(/\s+/);
  if (p.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = p;
  const isNum = (x) => /^\d+$/.test(x);
  if (isNum(min) && isNum(hour) && dom === '*' && mon === '*' && dow === '*') return `Every day at ${pad(hour)}:${pad(min)}`;
  if (isNum(min) && isNum(hour) && dom === '*' && mon === '*' && isNum(dow)) return `Every ${DAYS[Number(dow) % 7]} at ${pad(hour)}:${pad(min)}`;
  if (isNum(min) && /^\*\/\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') return `Every ${hour.slice(2)} hours at :${pad(min)}`;
  if (isNum(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Every hour at :${pad(min)}`;
  if (/^\*\/\d+$/.test(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Every ${min.slice(2)} minutes`;
  return cron;
}
