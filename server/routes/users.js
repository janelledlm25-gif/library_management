const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuid } = require('uuid');
const { readTable, writeTable } = require('../utils/db');
const { fail, ok, required, validEmail, publicUser } = require('../utils/http');
const router = express.Router();
const fields = ['firstName', 'lastName', 'email', 'course', 'role'];
router.get('/', async (req, res) => ok(res, (await readTable('tbl_user')).map(publicUser)));
router.post('/', async (req, res) => {
  required(req.body, [...fields, 'password']);
  if (!validEmail(req.body.email)) fail(400, 'Enter a valid email address.');
  if (!['admin', 'librarian', 'student'].includes(req.body.role)) fail(400, 'Role must be admin, librarian, or student.');
  const users = await readTable('tbl_user');
  if (users.some(user => user.email.toLowerCase() === req.body.email.trim().toLowerCase())) fail(409, 'Email is already in use.');
  if (req.body.role === 'admin') {
    const existingAdmin = users.find(user => user.role === 'admin');
    if (!existingAdmin || existingAdmin.id !== req.auth.sub) fail(403, 'Only the existing admin can create another admin account.');
  }
  const user = { id: uuid(), firstName: req.body.firstName.trim(), lastName: req.body.lastName.trim(), email: req.body.email.trim().toLowerCase(), passwordHash: await bcrypt.hash(req.body.password, 10), course: req.body.course.trim(), role: req.body.role, rfidUid: String(req.body.rfidUid || '').trim(), createdAt: new Date().toISOString() };
  users.push(user); await writeTable('tbl_user', users); ok(res, publicUser(user), 'User created.', 201);
});
router.put('/:id', async (req, res) => {
  const users = await readTable('tbl_user'); const index = users.findIndex(user => user.id === req.params.id);
  if (index < 0) fail(404, 'User not found.'); required(req.body, fields);
  if (!validEmail(req.body.email)) fail(400, 'Enter a valid email address.');
  if (!['admin', 'librarian', 'student'].includes(req.body.role)) fail(400, 'Role must be admin, librarian, or student.');
  if (users.some((user, i) => i !== index && user.email.toLowerCase() === req.body.email.trim().toLowerCase())) fail(409, 'Email is already in use.');
  const updated = { ...users[index], ...Object.fromEntries(fields.map(field => [field, field === 'email' ? req.body[field].trim().toLowerCase() : req.body[field].trim()])), rfidUid: req.body.rfidUid === undefined ? users[index].rfidUid : String(req.body.rfidUid).trim() };
  if (req.body.password) updated.passwordHash = await bcrypt.hash(req.body.password, 10);
  users[index] = updated; await writeTable('tbl_user', users); ok(res, publicUser(updated), 'User updated.');
});
router.delete('/:id', async (req, res) => {
  if (req.params.id === req.auth.sub) fail(403, "You can't delete your own account.");
  const users = await readTable('tbl_user'); const next = users.filter(user => user.id !== req.params.id);
  if (next.length === users.length) fail(404, 'User not found.');
  await writeTable('tbl_user', next); ok(res, { id: req.params.id }, 'User deleted.');
});
module.exports = router;
