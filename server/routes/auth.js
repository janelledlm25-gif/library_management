const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { rateLimit } = require('express-rate-limit');
const { readTable, writeTable } = require('../utils/db');
const auth = require('../middleware/auth');
const { fail, ok, required, validEmail, publicUser } = require('../utils/http');
const router = express.Router();

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, data: null, message: 'Too many login attempts. Try again later.' } });
const registerLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, data: null, message: 'Too many registration attempts. Try again in 15 minutes.' } });

router.post('/register', registerLimit, async (req, res) => {
  required(req.body, ['firstName', 'lastName', 'email', 'password']);
  for (const field of ['firstName', 'lastName', 'email', 'password']) {
    if (typeof req.body[field] !== 'string') fail(400, `${field} must be text.`);
  }
  const firstName = req.body.firstName.trim();
  const lastName = req.body.lastName.trim();
  const email = req.body.email.trim().toLowerCase();
  const password = req.body.password.trim();
  if (!firstName || !lastName || !email || !password) fail(400, 'First name, last name, email, and password are required.');
  if (!validEmail(email)) fail(400, 'Enter a valid email address.');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters long.');
  const users = await readTable('tbl_user');
  if (users.some(user => String(user.email || '').trim().toLowerCase() === email)) fail(409, 'Email already registered');
  const user = {
    id: uuid(), firstName, lastName, email,
    passwordHash: await bcrypt.hash(password, 10), course: '',
    role: 'student', rfidUid: null, status: 'pending', mustChangePassword: false,
    createdAt: new Date().toISOString()
  };
  users.push(user); await writeTable('tbl_user', users);
  res.status(201).json({ success: true, message: 'Account created. Please wait for admin approval.' });
});

router.post('/login', loginLimit, async (req, res) => {
  required(req.body, ['email', 'password']);
  if (!validEmail(req.body.email)) fail(400, 'Enter a valid email address.');
  const users = await readTable('tbl_user');
  const user = users.find(item => item.email.toLowerCase() === req.body.email.trim().toLowerCase());
  if (!user || !await bcrypt.compare(req.body.password, user.passwordHash)) fail(401, 'Email or password is incorrect.');
  if (user.status === 'pending') fail(403, 'Your account is waiting for admin approval.');
  if (user.status === 'rejected') fail(403, 'Your account was rejected. Contact the library administrator.');
  if (user.status === 'inactive') fail(403, 'Your account is inactive. Contact the library administrator.');
  if (user.status && user.status !== 'active') fail(403, 'This account cannot sign in. Contact the library administrator.');
  const token = jwt.sign({ sub: user.id, role: user.role, mustChangePassword: Boolean(user.mustChangePassword) }, process.env.JWT_SECRET, { expiresIn: '8h' });
  const logs = await readTable('tbl_systemMaintenance');
  const log = { id: uuid(), userId: user.id, userName: `${user.firstName} ${user.lastName}`.trim(), action: 'login', timestamp: new Date().toISOString(), logoutTimestamp: null };
  logs.push(log); await writeTable('tbl_systemMaintenance', logs);
  ok(res, { token, user: publicUser(user), logId: log.id }, 'Login successful.');
});
router.post('/logout', auth, async (req, res) => {
  const logs = await readTable('tbl_systemMaintenance');
  const active = [...logs].reverse().find(item => item.userId === req.auth.sub && item.action === 'login' && !item.logoutTimestamp);
  if (active) active.logoutTimestamp = new Date().toISOString();
  await writeTable('tbl_systemMaintenance', logs); ok(res, { loggedOut: true }, 'Logout successful.');
});
router.put('/change-password', auth, async (req, res) => {
  required(req.body, ['currentPassword', 'newPassword']);
  if (typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 8) fail(400, 'New password must be at least 8 characters long.');
  const users = await readTable('tbl_user');
  const index = users.findIndex(user => user.id === req.auth.sub);
  if (index < 0) fail(404, 'User not found.');
  if (!await bcrypt.compare(req.body.currentPassword, users[index].passwordHash)) fail(401, 'Current password is incorrect.');
  users[index].passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  users[index].mustChangePassword = false;
  await writeTable('tbl_user', users);
  const token = jwt.sign({ sub: users[index].id, role: users[index].role, mustChangePassword: false }, process.env.JWT_SECRET, { expiresIn: '8h' });
  ok(res, { token, user: publicUser(users[index]) }, 'Password changed successfully.');
});
router.get('/me', auth, async (req, res) => {
  const user = (await readTable('tbl_user')).find(item => item.id === req.auth.sub);
  if (!user) fail(404, 'User not found.'); ok(res, publicUser(user));
});
module.exports = router;
