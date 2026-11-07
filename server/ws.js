import { WebSocketServer } from 'ws';
import { sessionUser } from './auth.js';
import { getServer } from './db.js';
import { hub } from './consoleHub.js';
import { sendCommand } from './serverManager.js';

/**
 * WebSocket endpoint for live consoles.
 * client -> { type: 'subscribe', serverId } | { type: 'unsubscribe', serverId } | { type: 'command', serverId, command }
 * server -> { type: 'history', serverId, lines } | { type: 'lines', serverId, lines } | { type: 'error', message }
 */
export function attachWebsocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws')) return socket.destroy();
    const found = sessionUser(req.headers.cookie);
    if (!found) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = found.user;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const subs = new Map();
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const id = String(msg.serverId || '');
      if (!getServer(id)) return send({ type: 'error', message: 'Server not found' });
      if (msg.type === 'subscribe' && !subs.has(id)) {
        send({ type: 'history', serverId: id, lines: hub.history(id) });
        subs.set(id, hub.subscribe(id, (lines) => send({ type: 'lines', serverId: id, lines })));
      } else if (msg.type === 'unsubscribe') {
        subs.get(id)?.();
        subs.delete(id);
      } else if (msg.type === 'command') {
        try { await sendCommand(id, msg.command); } catch (err) { send({ type: 'error', serverId: id, message: err.message }); }
      }
    });
    ws.on('close', () => { for (const off of subs.values()) off(); subs.clear(); });
  });

  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  ping.unref();
  return wss;
}
