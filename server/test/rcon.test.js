import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { rconCommand, parsePlayers } from '../rcon.js';

function packet(id, type, body) {
  const b = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(14 + b.length);
  buf.writeInt32LE(10 + b.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  b.copy(buf, 12);
  return buf;
}

function fakeServer(password, handler) {
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
          const size = buf.readInt32LE(0);
          const id = buf.readInt32LE(4);
          const type = buf.readInt32LE(8);
          const body = buf.subarray(12, size + 2).toString();
          buf = buf.subarray(size + 4);
          if (type === 3) {
            sock.write(packet(id, 0, ''));
            sock.write(packet(body === password ? id : -1, 2, ''));
          } else if (type === 2) {
            sock.write(packet(id, 0, handler(body)));
          }
        }
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('executes a command and returns the response', async () => {
  const srv = await fakeServer('secret', (cmd) => (cmd === 'ListPlayers' ? '0. Bob, 0002a1b2c3d4e5f6a7b8c9d0e1f2a3b4\n1. Alice Smith, 0002ffffeeeeddddccccbbbbaaaa9999 \n' : 'ok'));
  try {
    const out = await rconCommand({ port: srv.address().port, password: 'secret', command: 'ListPlayers' });
    const players = parsePlayers(out);
    assert.equal(players.length, 2);
    assert.equal(players[1].name, 'Alice Smith');
    assert.equal(players[0].id, '0002a1b2c3d4e5f6a7b8c9d0e1f2a3b4');
  } finally {
    srv.close();
  }
});

test('rejects a wrong password', async () => {
  const srv = await fakeServer('secret', () => 'ok');
  try {
    await assert.rejects(rconCommand({ port: srv.address().port, password: 'nope', command: 'x' }), /authentication failed/);
  } finally {
    srv.close();
  }
});

test('parses "No Players Connected"', () => {
  assert.deepEqual(parsePlayers('No Players Connected'), []);
});
