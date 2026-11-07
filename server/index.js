import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { config, paths, ensureDirs } from './config.js';

ensureDirs();

const { db } = await import('./db.js');
const { requireAuth } = await import('./auth.js');
const { authRouter, usersRouter } = await import('./routes/auth.js');
const { serversRouter } = await import('./routes/servers.js');
const { clustersRouter } = await import('./routes/clusters.js');
const { filesRouter } = await import('./routes/files.js');
const { systemRouter } = await import('./routes/system.js');
const { attachWebsocket } = await import('./ws.js');
const { initServers, shutdownHook } = await import('./serverManager.js');
const { initScheduler } = await import('./scheduler.js');
const { detectPublicIp } = await import('./network.js');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use('/api', express.json({ limit: '15mb' }));
app.use('/api', authRouter);
app.use('/api', requireAuth, usersRouter, serversRouter, clustersRouter, filesRouter, systemRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API endpoint' }));

// Frontend (built by `npm run build`)
if (fs.existsSync(path.join(paths.webDist, 'index.html'))) {
  app.use(express.static(paths.webDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(paths.webDist, 'index.html')));
} else {
  app.get('*', (req, res) => res.status(503).send('Frontend not built. Run "npm run build" in the panel folder.'));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(`[api] ${req.method} ${req.url}:`, err);
  if (!res.headersSent) res.status(status).json({ error: err.message || 'Internal error' });
});

const server = http.createServer(app);
attachWebsocket(server);

if (!db.data.users.length) {
  console.warn('[panel] No users exist yet. Create one with: sudo -u arkpanel node server/cli.js create-user <name>');
}

fs.writeFileSync(path.join(paths.run, 'panel.pid'), String(process.pid));
detectPublicIp().catch(() => {});
await initServers();
initScheduler();

server.listen(config.port, config.host, () => {
  console.log(`[panel] Obelisk ${config.version} listening on http://${config.host}:${config.port}`);
  console.log(`[panel] Data directory: ${config.dataDir}`);
});

function shutdown(signal) {
  console.log(`[panel] ${signal} received, shutting down (game servers keep running).`);
  shutdownHook();
  try { db.saveNow(); } catch (err) { console.error(err); }
  try { fs.rmSync(path.join(paths.run, 'panel.pid'), { force: true }); } catch { /* ignore */ }
  server.close();
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('exit', () => { try { db.saveNow(); } catch { /* ignore */ } });
process.on('unhandledRejection', (err) => console.error('[panel] Unhandled rejection:', err));
