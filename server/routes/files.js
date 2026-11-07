import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Router } from 'express';
import busboy from 'busboy';
import { ah, badRequest, notFound } from '../util/errors.js';
import * as files from '../files.js';

export const filesRouter = Router();

const root = (req) => files.resolveRoot(req.params.type, req.params.id);
const base = '/files/:type(server|cluster)/:id';

filesRouter.get(`${base}/list`, (req, res) => {
  res.json(files.listDir(root(req), req.query.path || ''));
});

filesRouter.get(`${base}/read`, (req, res) => {
  res.json(files.readText(root(req), req.query.path || ''));
});

filesRouter.put(`${base}/write`, (req, res) => {
  files.writeText(root(req), req.body?.path, req.body?.content, req.body?.encoding);
  res.json({ ok: true });
});

filesRouter.post(`${base}/mkdir`, (req, res) => {
  files.makeDir(root(req), req.body?.path || '', req.body?.name);
  res.json({ ok: true });
});

filesRouter.post(`${base}/touch`, (req, res) => {
  files.createFile(root(req), req.body?.path || '', req.body?.name);
  res.json({ ok: true });
});

filesRouter.post(`${base}/rename`, (req, res) => {
  files.renamePath(root(req), req.body?.from, req.body?.to);
  res.json({ ok: true });
});

filesRouter.post(`${base}/delete`, ah(async (req, res) => {
  await files.deletePaths(root(req), req.body?.paths);
  res.json({ ok: true });
}));

filesRouter.post(`${base}/compress`, ah(async (req, res) => {
  const name = await files.compressPaths(root(req), req.body?.path || '', req.body?.names, req.body?.archive);
  res.json({ ok: true, name });
}));

filesRouter.post(`${base}/extract`, ah(async (req, res) => {
  await files.extractArchive(root(req), req.body?.path);
  res.json({ ok: true });
}));

filesRouter.get(`${base}/download`, (req, res) => {
  const r = root(req);
  const target = files.safePath(r, req.query.path || '');
  let st;
  try { st = fs.statSync(target); } catch { throw notFound('Not found'); }
  if (st.isFile()) return res.download(target);
  // folders are streamed as .tar.gz
  const name = target === r ? `${req.params.type}-${req.params.id}` : path.basename(target);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}.tar.gz"`);
  const tar = spawn('tar', ['-czf', '-', '-C', path.dirname(target), path.basename(target)]);
  tar.stdout.pipe(res);
  tar.on('error', () => res.destroy());
  req.on('close', () => tar.kill());
});

filesRouter.post(`${base}/upload`, (req, res, next) => {
  let dir;
  try {
    const r = root(req);
    dir = files.safePath(r, req.query.path || '');
    if (!fs.statSync(dir).isDirectory()) throw badRequest('Upload target is not a folder');
  } catch (err) { return next(err); }

  const bb = busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 ** 3, files: 200 } });
  const pending = [];
  const saved = [];
  let failed = null;

  bb.on('file', (_field, stream, info) => {
    // allow relative paths (folder uploads) but keep them inside the target dir
    const rel = String(info.filename || '').replace(/\\/g, '/').split('/').filter((p) => p && p !== '.' && p !== '..').join('/');
    if (!rel) { stream.resume(); return; }
    let dest;
    try { dest = files.safePath(dir, rel); } catch (err) { failed = err; stream.resume(); return; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.uploading`;
    const out = fs.createWriteStream(tmp);
    pending.push(new Promise((resolve) => {
      out.on('finish', () => {
        if (stream.truncated) { fs.rmSync(tmp, { force: true }); failed = badRequest('File too large'); }
        else { fs.renameSync(tmp, dest); saved.push(rel); }
        resolve();
      });
      out.on('error', (err) => { failed = err; resolve(); });
    }));
    stream.pipe(out);
  });
  bb.on('error', (err) => { failed = err; });
  bb.on('close', async () => {
    await Promise.all(pending);
    if (failed) return next(failed.status ? failed : badRequest(failed.message));
    res.json({ ok: true, saved });
  });
  req.pipe(bb);
});
