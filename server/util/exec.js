import { spawn } from 'node:child_process';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
export const stripAnsi = (s) => s.replace(ANSI, '');

/**
 * Run a command and stream its output line by line.
 * Resolves with { code, output } (output = last ~200 lines) and never rejects on a non-zero exit.
 */
export function runCommand(cmd, args = [], { cwd, env, onLine, input } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: env ? { ...process.env, ...env } : process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      reject(err);
      return;
    }
    const tail = [];
    const handle = (stream) => {
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        buf += chunk;
        const parts = buf.split(/\r\n|\n|\r/);
        buf = parts.pop();
        for (const p of parts) emit(p);
      });
      stream.on('end', () => { if (buf) emit(buf); });
    };
    const emit = (line) => {
      const clean = stripAnsi(line).trimEnd();
      if (!clean) return;
      tail.push(clean);
      if (tail.length > 200) tail.shift();
      onLine?.(clean);
    };
    handle(child.stdout);
    handle(child.stderr);
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        const e = new Error(`"${cmd}" is not installed on this system (run the installer again or: sudo apt install ${cmd})`);
        e.status = 500;
        reject(e);
      } else reject(err);
    });
    child.on('close', (code) => resolve({ code: code ?? -1, output: tail.join('\n') }));
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Run a command and throw if it exits non-zero. */
export async function mustRun(cmd, args, opts = {}) {
  const res = await runCommand(cmd, args, opts);
  if (res.code !== 0) {
    const err = new Error(`${cmd} exited with code ${res.code}: ${res.output.split('\n').slice(-5).join(' | ')}`);
    err.code = res.code;
    throw err;
  }
  return res;
}

/** Split a user-supplied argument string, respecting simple double/single quotes. */
export function splitArgs(str) {
  if (!str) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(str))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
