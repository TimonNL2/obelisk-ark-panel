import fs from 'node:fs';
import crypto from 'node:crypto';
import { paths } from './config.js';

const DEFAULT_SETTINGS = {
  panelName: 'Obelisk',
  publicIp: '',
  backupRetention: 10,
  updateCheckMinutes: 60,
  activeProton: '',
  basePort: 7777,
  baseQueryPort: 27015,
  baseRconPort: 27020,
  stopTimeoutSeconds: 120,
};

function defaults() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    users: [],
    sessions: [],
    clusters: [],
    servers: [],
    schedules: [],
  };
}

/**
 * Tiny JSON-file database. The whole dataset is small (servers, users, schedules),
 * so we keep it in memory and write it atomically (tmp file + rename) on change.
 */
class Store {
  constructor(file) {
    this.file = file;
    this.timer = null;
    this.data = this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const base = defaults();
      const data = { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
      // the panel was renamed from "ARK Panel" to "Obelisk"
      if (data.settings.panelName === 'ARK Panel') data.settings.panelName = 'Obelisk';
      return data;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Keep a copy of a corrupt file instead of silently overwriting it.
        try { fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`); } catch { /* ignore */ }
        console.error(`[db] Could not read ${this.file}: ${err.message}. Starting with a fresh database.`);
      }
      return defaults();
    }
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.saveNow();
    }, 150);
  }

  saveNow() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

export const db = new Store(paths.db);

export const newId = () => crypto.randomBytes(4).toString('hex');

export const getServer = (id) => db.data.servers.find((s) => s.id === id);
export const getCluster = (id) => db.data.clusters.find((c) => c.id === id);
export const settings = () => db.data.settings;
