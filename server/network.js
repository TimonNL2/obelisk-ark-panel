import os from 'node:os';

let detectedIp = null;

/** Best-effort public IP detection (used to show "connect" addresses). */
export async function detectPublicIp() {
  for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip']) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'arkpanel' } });
      const text = (await res.text()).trim();
      if (/^[\d.]+$|^[0-9a-f:]+$/i.test(text)) { detectedIp = text; return text; }
    } catch { /* try next */ }
  }
  return null;
}

export const publicIp = () => detectedIp;

export function localIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}
