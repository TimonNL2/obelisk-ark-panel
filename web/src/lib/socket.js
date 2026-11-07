/**
 * Shared websocket for live consoles. Connects lazily on first subscribe and reconnects automatically.
 */
class ConsoleSocket {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.statusListeners = new Set();
    this.connected = false;
    this.retry = null;
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.setConnected(true);
      for (const id of this.handlers.keys()) this.raw({ type: 'subscribe', serverId: id });
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const set = this.handlers.get(msg.serverId);
      if (set) for (const fn of set) fn(msg);
    };
    ws.onclose = () => {
      this.setConnected(false);
      if (this.handlers.size) {
        clearTimeout(this.retry);
        this.retry = setTimeout(() => this.connect(), 2500);
      }
    };
  }

  setConnected(v) {
    this.connected = v;
    for (const fn of this.statusListeners) fn(v);
  }

  onStatus(fn) {
    this.statusListeners.add(fn);
    fn(this.connected);
    return () => this.statusListeners.delete(fn);
  }

  raw(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  subscribe(serverId, fn) {
    if (!this.handlers.has(serverId)) {
      this.handlers.set(serverId, new Set());
      this.raw({ type: 'subscribe', serverId });
    }
    this.handlers.get(serverId).add(fn);
    this.connect();
    return () => {
      const set = this.handlers.get(serverId);
      set?.delete(fn);
      if (set && !set.size) {
        this.handlers.delete(serverId);
        this.raw({ type: 'unsubscribe', serverId });
      }
    };
  }

  command(serverId, command) {
    this.raw({ type: 'command', serverId, command });
  }
}

export const consoleSocket = new ConsoleSocket();
