import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Load KEY=VALUE pairs from an env file without overriding real environment variables. */
function loadEnvFile(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* file is optional */
  }
}

loadEnvFile(process.env.ARKPANEL_ENV || '/etc/arkpanel/arkpanel.env');
loadEnvFile(path.join(APP_DIR, '.env'));

const dataDir = path.resolve(process.env.DATA_DIR || path.join(APP_DIR, 'data'));

export const config = {
  appDir: APP_DIR,
  port: Number(process.env.PORT) || 8080,
  host: process.env.HOST || '0.0.0.0',
  dataDir,
  isLinux: process.platform === 'linux',
  trustProxy: process.env.TRUST_PROXY === '1',
  secureCookies: process.env.SECURE_COOKIES === '1',
  version: JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).version,
};

export const paths = {
  db: path.join(dataDir, 'panel.json'),
  servers: path.join(dataDir, 'servers'),
  clusters: path.join(dataDir, 'clusters'),
  backups: path.join(dataDir, 'backups'),
  prefixes: path.join(dataDir, 'prefixes'),
  tools: path.join(dataDir, 'tools'),
  steamcmd: path.join(dataDir, 'tools', 'steamcmd'),
  proton: path.join(dataDir, 'tools', 'proton'),
  steamClient: path.join(dataDir, 'tools', 'steam'),
  logs: path.join(dataDir, 'logs'),
  run: path.join(dataDir, 'run'),
  tmp: path.join(dataDir, 'tmp'),
  webDist: path.join(APP_DIR, 'web', 'dist'),
};

export function ensureDirs() {
  for (const key of ['servers', 'clusters', 'backups', 'prefixes', 'tools', 'steamcmd', 'proton', 'steamClient', 'logs', 'run', 'tmp']) {
    fs.mkdirSync(paths[key], { recursive: true });
  }
}

export const serverDir = (id) => path.join(paths.servers, id);
export const clusterDir = (id) => path.join(paths.clusters, id);
export const prefixDir = (id) => path.join(paths.prefixes, id);
export const consoleLogFile = (id) => path.join(paths.logs, `${id}.log`);
