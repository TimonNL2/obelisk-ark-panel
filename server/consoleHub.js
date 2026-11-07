import fs from 'node:fs';
import path from 'node:path';
import { consoleLogFile, serverDir } from './config.js';
import { stripAnsi } from './util/exec.js';

const MAX_LINES = 1000;
const MAX_LOG_BYTES = 20 * 1024 * 1024;

/** Follows a file that may be truncated or replaced (log rotation) by polling. */
class FileTailer {
  constructor(file, onLines, { historyBytes = 48 * 1024 } = {}) {
    this.file = file;
    this.onLines = onLines;
    this.pos = null;
    this.ino = null;
    this.partial = '';
    this.historyBytes = historyBytes;
    this.busy = false;
  }

  poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      let st;
      try { st = fs.statSync(this.file); } catch { this.pos = this.pos === null ? null : 0; this.ino = null; return; }
      if (this.pos === null) {
        // first look: read only the tail as history
        this.pos = Math.max(0, st.size - this.historyBytes);
        this.ino = st.ino;
        this.skipFirstPartial = this.pos > 0;
      } else if (st.ino !== this.ino || st.size < this.pos) {
        this.pos = 0;
        this.ino = st.ino;
        this.partial = '';
      }
      if (st.size <= this.pos) return;
      const len = Math.min(st.size - this.pos, 512 * 1024);
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(this.file, 'r');
      try { fs.readSync(fd, buf, 0, len, this.pos); } finally { fs.closeSync(fd); }
      this.pos += len;
      let text = this.partial + buf.toString('utf8');
      const parts = text.split(/\r\n|\n|\r/);
      this.partial = parts.pop();
      if (this.skipFirstPartial) { parts.shift(); this.skipFirstPartial = false; }
      const lines = parts.map((l) => stripAnsi(l).trimEnd()).filter(Boolean);
      if (lines.length) this.onLines(lines);
    } catch {
      /* ignore transient errors */
    } finally {
      this.busy = false;
    }
  }
}

/**
 * Collects console output per server:
 *  - the panel console log (panel messages, SteamCMD output, process stdout/stderr)
 *  - ARK's own ShooterGame.log
 * and broadcasts new lines to websocket subscribers.
 */
class ConsoleHub {
  constructor() {
    this.buffers = new Map();
    this.subscribers = new Map();
    this.viewers = new Map();
    this.tailers = new Map();
    this.timer = setInterval(() => this.pollAll(), 500);
    this.timer.unref?.();
  }

  track(server) {
    if (this.tailers.has(server.id)) return;
    const id = server.id;
    const panelTail = new FileTailer(consoleLogFile(id), (lines) => this.ingest(id, 'console', lines));
    const gameTail = new FileTailer(path.join(serverDir(id), 'ShooterGame/Saved/Logs/ShooterGame.log'), (lines) => this.ingest(id, 'game', lines), { historyBytes: 16 * 1024 });
    this.tailers.set(id, [panelTail, gameTail]);
    panelTail.poll();
    gameTail.poll();
  }

  untrack(id) {
    this.tailers.delete(id);
    this.buffers.delete(id);
  }

  /**
   * Every 0.5 s for consoles someone is watching, every 5 s otherwise
   * (still often enough for start detection and crash handling).
   */
  pollAll() {
    this.ticks = (this.ticks || 0) + 1;
    const slowTick = this.ticks % 10 === 0;
    for (const [id, tails] of this.tailers) {
      const watched = (this.viewers.get(id) || 0) > 0;
      if (watched || slowTick) for (const t of tails) t.poll();
    }
  }

  pollNow(id) {
    for (const t of this.tailers.get(id) || []) t.poll();
  }

  ingest(id, source, lines) {
    const buf = this.buffers.get(id) || [];
    const entries = lines.map((text) => ({ t: Date.now(), s: source, m: text }));
    buf.push(...entries);
    if (buf.length > MAX_LINES) buf.splice(0, buf.length - MAX_LINES);
    this.buffers.set(id, buf);
    const subs = this.subscribers.get(id);
    if (subs) for (const fn of subs) fn(entries);
  }

  history(id) {
    return this.buffers.get(id) || [];
  }

  /** viewer = a person watching the console (speeds up polling); internal listeners pass false. */
  subscribe(id, fn, { viewer = false } = {}) {
    if (!this.subscribers.has(id)) this.subscribers.set(id, new Set());
    this.subscribers.get(id).add(fn);
    if (viewer) this.viewers.set(id, (this.viewers.get(id) || 0) + 1);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.subscribers.get(id)?.delete(fn);
      if (viewer) this.viewers.set(id, Math.max(0, (this.viewers.get(id) || 1) - 1));
    };
  }

  /** Write a panel message into the server's console log. */
  log(id, message, prefix = 'Panel') {
    const stamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const lines = String(message).split(/\r?\n/).map((l) => `[${stamp}] [${prefix}] ${l}`).join('\n');
    try { fs.appendFileSync(consoleLogFile(id), `${lines}\n`); } catch { /* ignore */ }
  }

  clear(id) {
    this.buffers.set(id, []);
  }

  /** Rotate the console log when it grows too large (called before a server start). */
  rotate(id) {
    const file = consoleLogFile(id);
    try {
      if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, `${file}.1`);
    } catch { /* ignore */ }
  }
}

export const hub = new ConsoleHub();
