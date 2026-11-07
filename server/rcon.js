import net from 'node:net';

/**
 * Minimal Source RCON client (the protocol ARK uses).
 * Each call opens a fresh connection: ARK's RCON is stateless enough that this is the most robust approach.
 */
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;

function packet(id, type, body) {
  const bodyBuf = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(14 + bodyBuf.length);
  buf.writeInt32LE(10 + bodyBuf.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  return buf; // last two bytes are already 0 (body terminator + empty string)
}

export function rconCommand({ host = '127.0.0.1', port, password, command, timeout = 8000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let authed = false;
    let response = '';
    let gotResponse = false;
    let finishTimer = null;
    let done = false;

    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(finishTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      if (gotResponse) finish(null, response);
      else finish(new Error(authed ? 'RCON command timed out' : 'RCON connection timed out'));
    }, timeout);

    socket.on('connect', () => socket.write(packet(1, SERVERDATA_AUTH, password || '')));
    socket.on('error', (err) => finish(new Error(`RCON ${err.code || err.message}`)));
    socket.on('close', () => {
      if (gotResponse) finish(null, response);
      else finish(new Error('RCON connection closed'));
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const size = buf.readInt32LE(0);
        if (size < 10 || size > 1024 * 1024) { finish(new Error('Invalid RCON packet')); return; }
        if (buf.length < size + 4) break;
        const id = buf.readInt32LE(4);
        const type = buf.readInt32LE(8);
        const body = buf.subarray(12, size + 2).toString('utf8');
        buf = buf.subarray(size + 4);

        if (!authed) {
          if (type === SERVERDATA_AUTH_RESPONSE) {
            if (id === -1) { finish(new Error('RCON authentication failed (wrong admin password)')); return; }
            authed = true;
            socket.write(packet(2, SERVERDATA_EXECCOMMAND, command));
          }
          continue;
        }
        if (id === 2) {
          response += body;
          gotResponse = true;
          // ARK may split long answers over multiple packets: wait briefly for more.
          clearTimeout(finishTimer);
          finishTimer = setTimeout(() => finish(null, response), 250);
        }
      }
    });
  });
}

/** Parse the output of ARK's ListPlayers command. */
export function parsePlayers(text) {
  const players = [];
  for (const line of (text || '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\.\s*(.*?),\s*([0-9a-fA-F]{8,})\s*$/.exec(line);
    if (m) players.push({ index: Number(m[1]), name: m[2].trim(), id: m[3] });
  }
  return players;
}
