#!/usr/bin/env node
/**
 * ARK Panel command line helper.
 *   node server/cli.js create-user <username> [password]
 *   node server/cli.js reset-password <username> [password]
 *   node server/cli.js list-users
 *   node server/cli.js bootstrap        # download SteamCMD + GE-Proton
 * Passwords that are not given are generated and printed.
 * User commands must run while the panel is stopped (it keeps the database in memory).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureDirs, paths } from './config.js';

ensureDirs();
const { db } = await import('./db.js');
const { createUser, hashPassword, validatePassword } = await import('./auth.js');

const [cmd, ...args] = process.argv.slice(2);
const genPassword = () => crypto.randomBytes(12).toString('base64url');

function panelRunning() {
  try {
    const pid = Number(fs.readFileSync(path.join(paths.run, 'panel.pid'), 'utf8'));
    process.kill(pid, 0);
    return pid;
  } catch {
    return false;
  }
}

function requireStopped() {
  const pid = panelRunning();
  if (pid) {
    console.error(`The panel is running (pid ${pid}). Stop it first: sudo systemctl stop arkpanel`);
    process.exit(1);
  }
}

try {
  switch (cmd) {
    case 'create-user': {
      requireStopped();
      const [username, pw] = args;
      if (!username) throw new Error('Usage: create-user <username> [password]');
      const password = pw || genPassword();
      await createUser(username, password);
      db.saveNow();
      console.log(`User "${username}" created.${pw ? '' : `\nPassword: ${password}`}`);
      break;
    }
    case 'reset-password': {
      requireStopped();
      const [username, pw] = args;
      const user = db.data.users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
      if (!user) throw new Error(`User "${username}" not found`);
      const password = pw || genPassword();
      validatePassword(password);
      user.passwordHash = await hashPassword(password);
      db.data.sessions = db.data.sessions.filter((s) => s.userId !== user.id);
      db.saveNow();
      console.log(`Password for "${user.username}" reset.${pw ? '' : `\nNew password: ${password}`}`);
      break;
    }
    case 'list-users':
      for (const u of db.data.users) console.log(`${u.username}\t(created ${u.createdAt})`);
      if (!db.data.users.length) console.log('No users.');
      break;
    case 'bootstrap': {
      const tools = await import('./tools.js');
      let failed = false;
      try {
        if (!tools.steamcmdInstalled()) await tools.installSteamcmd((m) => console.log(`[steamcmd] ${m}`));
        else console.log('[steamcmd] already installed');
      } catch (err) { failed = true; console.error(`[steamcmd] ${err.message}`); }
      try {
        if (!tools.activeProton()) await tools.installLatestProton((m) => console.log(`[proton] ${m}`));
        else console.log(`[proton] ${tools.activeProton()} already installed`);
      } catch (err) { failed = true; console.error(`[proton] ${err.message}`); }
      db.saveNow();
      if (failed) process.exit(1);
      break;
    }
    case 'stop-all': {
      // Used by arkpanel-servers.service on machine shutdown: save and stop every running game server.
      const { scanTaggedProcesses, killPids } = await import('./util/procs.js');
      const { rconCommand } = await import('./rcon.js');
      const timeout = Number(args[0]) || 180;
      const running = db.data.servers.filter((s) => scanTaggedProcesses().has(s.id));
      if (!running.length) { console.log('No game servers running.'); break; }
      await Promise.all(running.map(async (s) => {
        const opts = { port: s.ports.rcon, password: s.adminPassword };
        try {
          await rconCommand({ ...opts, command: 'SaveWorld', timeout: 60000 });
          console.log(`[${s.name}] world saved`);
          await rconCommand({ ...opts, command: 'DoExit', timeout: 10000 }).catch(() => {});
        } catch (err) {
          console.log(`[${s.name}] RCON failed (${err.message}), terminating`);
          killPids(scanTaggedProcesses().get(s.id) || [], 'SIGTERM');
        }
      }));
      const until = Date.now() + timeout * 1000;
      while (Date.now() < until && running.some((s) => scanTaggedProcesses().has(s.id))) await new Promise((r) => setTimeout(r, 2000));
      for (const s of running) {
        const left = scanTaggedProcesses().get(s.id);
        if (left?.length) { console.log(`[${s.name}] still running, killing`); killPids(left, 'SIGKILL'); }
        else console.log(`[${s.name}] stopped`);
      }
      // keep autostart behaviour: servers that were running come back on next boot only if autoStart is on
      break;
    }
    default:
      console.log('Usage: node server/cli.js <create-user|reset-password|list-users|bootstrap|stop-all> [args]');
      process.exit(cmd ? 1 : 0);
  }
  process.exit(0);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
