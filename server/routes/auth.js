import { Router } from 'express';
import { db } from '../db.js';
import { ah, badRequest, notFound } from '../util/errors.js';
import {
  requireAuth, verifyLogin, createSession, destroySession, publicUser, checkLoginRate, recordFailedLogin,
  clearLoginAttempts, createUser, validatePassword, hashPassword, destroyUserSessions,
} from '../auth.js';
import bcrypt from 'bcryptjs';

export const authRouter = Router();

authRouter.post('/auth/login', ah(async (req, res) => {
  checkLoginRate(req.ip);
  const user = await verifyLogin(req.body?.username, req.body?.password);
  if (!user) {
    recordFailedLogin(req.ip);
    throw badRequest('Wrong username or password');
  }
  clearLoginAttempts(req.ip);
  user.lastLoginAt = new Date().toISOString();
  createSession(res, user, req);
  res.json({ user: publicUser(user) });
}));

authRouter.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), panelName: db.data.settings.panelName });
});

authRouter.post('/auth/password', requireAuth, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!(await bcrypt.compare(String(currentPassword || ''), req.user.passwordHash))) throw badRequest('Current password is wrong');
  validatePassword(newPassword);
  req.user.passwordHash = await hashPassword(newPassword);
  destroyUserSessions(req.user.id, req.session.hash);
  db.save();
  res.json({ ok: true });
}));

/* ------------------------------ users ------------------------------ */

export const usersRouter = Router();

usersRouter.get('/users', (req, res) => {
  res.json(db.data.users.map(publicUser));
});

usersRouter.post('/users', ah(async (req, res) => {
  const user = await createUser(req.body?.username, req.body?.password);
  res.status(201).json(publicUser(user));
}));

usersRouter.put('/users/:id/password', ah(async (req, res) => {
  const user = db.data.users.find((u) => u.id === req.params.id);
  if (!user) throw notFound('User not found');
  validatePassword(req.body?.password);
  user.passwordHash = await hashPassword(req.body.password);
  destroyUserSessions(user.id, user.id === req.user.id ? req.session.hash : undefined);
  db.save();
  res.json({ ok: true });
}));

usersRouter.delete('/users/:id', (req, res) => {
  if (req.params.id === req.user.id) throw badRequest('You cannot delete your own account');
  if (db.data.users.length <= 1) throw badRequest('At least one user must remain');
  db.data.users = db.data.users.filter((u) => u.id !== req.params.id);
  destroyUserSessions(req.params.id);
  db.save();
  res.json({ ok: true });
});
