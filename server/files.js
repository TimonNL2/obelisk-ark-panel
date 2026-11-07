import fs from 'node:fs';
import path from 'node:path';
import { serverDir, clusterDir } from './config.js';
import { getServer, getCluster } from './db.js';
import { runCommand } from './util/exec.js';
import { badRequest, notFound } from './util/errors.js';

/**
 * File manager. Every path is resolved inside a "root" (a server's install folder or a
 * cluster folder) and checked against symlink escapes.
 */
export function resolveRoot(type, id) {
  if (type === 'server') {
    if (!getServer(id)) throw notFound('Server not found');
    return serverDir(id);
  }
  if (type === 'cluster') {
    if (!getCluster(id)) throw notFound('Cluster not found');
    const dir = clusterDir(id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  throw badRequest('Unknown file root');
}

const inside = (root, p) => p === root || p.startsWith(root + path.sep);

export function safePath(root, rel = '') {
  const cleaned = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleaned.split('/').includes('..')) throw badRequest('Invalid path');
  const full = path.resolve(root, cleaned);
  if (!inside(root, full)) throw badRequest('Path is outside the allowed folder');
  // Resolve symlinks of the deepest existing ancestor to block escapes.
  let probe = full;
  while (!fs.existsSync(probe) && probe !== root) probe = path.dirname(probe);
  const realRoot = fs.realpathSync(root);
  const real = fs.realpathSync(probe);
  if (!inside(realRoot, real)) throw badRequest('Path is outside the allowed folder');
  return full;
}

export const relPath = (root, full) => path.relative(root, full).split(path.sep).join('/');

export function listDir(root, rel) {
  const dir = safePath(root, rel);
  let st;
  try { st = fs.statSync(dir); } catch { throw notFound('Folder not found'); }
  if (!st.isDirectory()) throw badRequest('Not a folder');
  const entries = fs.readdirSync(dir, { withFileTypes: true }).map((d) => {
    const full = path.join(dir, d.name);
    let s = null;
    try { s = fs.statSync(full); } catch { /* broken link */ }
    return {
      name: d.name,
      path: relPath(root, full),
      type: s?.isDirectory() ? 'dir' : 'file',
      symlink: d.isSymbolicLink(),
      size: s && !s.isDirectory() ? s.size : null,
      modified: s ? s.mtime.toISOString() : null,
    };
  });
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
  return { path: relPath(root, dir), entries };
}

const MAX_EDIT = 10 * 1024 * 1024;

export function readText(root, rel) {
  const file = safePath(root, rel);
  let st;
  try { st = fs.statSync(file); } catch { throw notFound('File not found'); }
  if (!st.isFile()) throw badRequest('Not a file');
  if (st.size > MAX_EDIT) throw badRequest('File is too large to edit in the browser (max 10 MB). Download it instead.');
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 8000).includes(0)) {
    // UTF-16 files (some ARK ini files) contain zero bytes; decode them if there is a BOM.
    if (buf[0] === 0xff && buf[1] === 0xfe) return { content: buf.subarray(2).toString('utf16le'), encoding: 'utf16le', size: st.size, modified: st.mtime.toISOString() };
    throw badRequest('This is a binary file and cannot be edited.');
  }
  return { content: buf.toString('utf8'), encoding: 'utf8', size: st.size, modified: st.mtime.toISOString() };
}

export function writeText(root, rel, content, encoding = 'utf8') {
  const file = safePath(root, rel);
  if (typeof content !== 'string') throw badRequest('Content must be text');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.arkpanel-tmp`;
  if (encoding === 'utf16le') fs.writeFileSync(tmp, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, 'utf16le')]));
  else fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

const validName = (name) => {
  const n = String(name || '').trim();
  if (!n || n === '.' || n === '..' || /[/\\\0]/.test(n)) throw badRequest('Invalid name');
  return n;
};

export function makeDir(root, rel, name) {
  const dir = safePath(root, path.posix.join(rel || '', validName(name)));
  if (fs.existsSync(dir)) throw badRequest('Already exists');
  fs.mkdirSync(dir, { recursive: true });
}

export function createFile(root, rel, name) {
  const file = safePath(root, path.posix.join(rel || '', validName(name)));
  if (fs.existsSync(file)) throw badRequest('Already exists');
  fs.writeFileSync(file, '');
}

export function renamePath(root, from, to) {
  const src = safePath(root, from);
  const dst = safePath(root, to);
  if (src === root) throw badRequest('Cannot rename the root folder');
  if (!fs.existsSync(src)) throw notFound('Source not found');
  if (fs.existsSync(dst)) throw badRequest('Destination already exists');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
}

export async function deletePaths(root, rels) {
  for (const rel of rels || []) {
    const p = safePath(root, rel);
    if (p === root) throw badRequest('Cannot delete the root folder');
    await fs.promises.rm(p, { recursive: true, force: true });
  }
}

export async function compressPaths(root, rel, names, archiveName) {
  const dir = safePath(root, rel);
  const items = (names || []).map((n) => validName(n));
  if (!items.length) throw badRequest('Nothing selected');
  for (const n of items) safePath(root, path.posix.join(rel || '', n));
  let name = validName(archiveName || `archive-${Date.now()}.tar.gz`);
  const isZip = name.endsWith('.zip');
  if (!isZip && !/\.tar\.gz$|\.tgz$/.test(name)) name += '.tar.gz';
  const out = safePath(root, path.posix.join(rel || '', name));
  if (fs.existsSync(out)) throw badRequest('An archive with that name already exists');
  const res = isZip
    ? await runCommand('zip', ['-r', '-q', out, ...items], { cwd: dir })
    : await runCommand('tar', ['-czf', out, ...items], { cwd: dir });
  if (res.code !== 0) throw badRequest(`Compress failed: ${res.output.split('\n').slice(-2).join(' ')}`);
  return name;
}

export async function extractArchive(root, rel) {
  const file = safePath(root, rel);
  const dir = path.dirname(file);
  const lower = file.toLowerCase();
  let res;
  if (lower.endsWith('.zip')) res = await runCommand('unzip', ['-o', '-q', file, '-d', dir]);
  else if (/\.(tar\.gz|tgz|tar|tar\.xz|tar\.zst|tar\.bz2)$/.test(lower)) res = await runCommand('tar', ['-xf', file, '-C', dir, '--no-same-owner']);
  else throw badRequest('Unsupported archive type (zip, tar, tar.gz, tar.xz)');
  if (res.code !== 0) throw badRequest(`Extract failed: ${res.output.split('\n').slice(-2).join(' ')}`);
}
