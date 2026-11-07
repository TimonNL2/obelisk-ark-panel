import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { db, newId } from './db.js';
import { badRequest, HttpError } from './util/errors.js';

export const COOKIE = 'arkpanel_session';
const SESSION_DAYS = 30;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 11);
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw badRequest('Password must be at least 8 characters');
  if (pw.length > 200) throw badRequest('Password is too long');
}

export function validateUsername(name) {
  const n = String(name || '').trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(n)) throw badRequest('Username must be 3-32 characters (letters, numbers, _ . -)');
  return n;
}

export async function createUser(username, password) {
  const name = validateUsername(username);
  validatePassword(password);
  if (db.data.users.some((u) => u.username.toLowerCase() === name.toLowerCase())) throw badRequest('That username already exists');
  const user = { id: newId(), username: name, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
  db.data.users.push(user);
  db.save();
  return user;
}

export const publicUser = (u) => ({ id: u.id, username: u.username, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null });

export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function sessionUser(cookieHeader) {
  const token = parseCookies(cookieHeader)[COOKIE];
  if (!token) return null;
  const hash = sha(token);
  const session = db.data.sessions.find((s) => s.hash === hash);
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  const user = db.data.users.find((u) => u.id === session.userId);
  if (!user) return null;
  // sliding expiry, written at most once per hour
  if (Date.now() - new Date(session.touchedAt || 0).getTime() > 3600_000) {
    session.touchedAt = new Date().toISOString();
    session.expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    db.save();
  }
  return { user, session };
}

export function createSession(res, user, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.data.sessions.push({
    hash: sha(token),
    userId: user.id,
    createdAt: new Date().toISOString(),
    touchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString(),
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
  });
  // prune expired sessions
  const now = new Date();
  db.data.sessions = db.data.sessions.filter((s) => new Date(s.expiresAt) > now);
  db.save();
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
    maxAge: SESSION_DAYS * 86400_000,
    path: '/',
  });
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const hash = sha(token);
    db.data.sessions = db.data.sessions.filter((s) => s.hash !== hash);
    db.save();
  }
  res.clearCookie(COOKIE, { path: '/' });
}

export function destroyUserSessions(userId, exceptHash) {
  db.data.sessions = db.data.sessions.filter((s) => s.userId !== userId || s.hash === exceptHash);
  db.save();
}

/** Express middleware: require a logged-in user and a CSRF header on state-changing requests. */
export function requireAuth(req, res, next) {
  const found = sessionUser(req.headers.cookie);
  if (!found) return next(new HttpError(401, 'Not logged in'));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-arkpanel'] !== '1') {
    return next(new HttpError(403, 'Missing request header'));
  }
  req.user = found.user;
  req.session = found.session;
  next();
}

/* --------- login rate limiting (per IP, in memory) --------- */
const attempts = new Map();
export function checkLoginRate(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60000);
  attempts.set(ip, list);
  if (list.length >= 10) throw new HttpError(429, 'Too many login attempts. Try again in 15 minutes.');
}
export function recordFailedLogin(ip) {
  const list = attempts.get(ip) || [];
  list.push(Date.now());
  attempts.set(ip, list);
}
export function clearLoginAttempts(ip) {
  attempts.delete(ip);
}

export async function verifyLogin(username, password) {
  const user = db.data.users.find((u) => u.username.toLowerCase() === String(username || '').trim().toLowerCase());
  // always run bcrypt to keep timing similar
  const ok = await bcrypt.compare(String(password || ''), user?.passwordHash || '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  return ok && user ? user : null;
}
