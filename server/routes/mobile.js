const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { readTable, writeTable } = require('../utils/db');
const { fail, ok, required, validEmail, publicUser } = require('../utils/http');
const router = express.Router();
router.post('/login', async (req, res) => {
  required(req.body, ['email', 'password']); if (!validEmail(req.body.email)) fail(400, 'Enter a valid email address.');
  const users = await readTable('tbl_user'); const user = users.find(item => item.email.toLowerCase() === req.body.email.trim().toLowerCase());
  if (!user || user.role !== 'student' || !await bcrypt.compare(req.body.password, user.passwordHash)) fail(401, 'Student email or password is incorrect.');
  if (user.status !== 'active') fail(403, user.status === 'pending' ? 'Your account is waiting for admin approval.' : user.status === 'rejected' ? 'Your account was rejected. Contact the library administrator.' : 'Your account is inactive. Contact the library administrator.');
  const token = jwt.sign({ sub: user.id, role: user.role, mustChangePassword: Boolean(user.mustChangePassword) }, process.env.JWT_SECRET, { expiresIn: '8h' });
  const devices = await readTable('tbl_mobile');
  if (req.body.deviceToken) {
    const existing = devices.find(device => device.userId === user.id && device.deviceToken === String(req.body.deviceToken));
    if (existing) existing.lastActive = new Date().toISOString();
    else devices.push({ id: uuid(), userId: user.id, deviceToken: String(req.body.deviceToken), lastActive: new Date().toISOString() });
    await writeTable('tbl_mobile', devices);
  }
  const logs = await readTable('tbl_systemMaintenance');
  const log = { id: uuid(), userId: user.id, userName: `${user.firstName} ${user.lastName}`.trim(), action: 'login', timestamp: new Date().toISOString(), logoutTimestamp: null };
  logs.push(log); await writeTable('tbl_systemMaintenance', logs);
  ok(res, { token, user: publicUser(user), logId: log.id }, 'Login successful.');
});
router.get('/my-books', async (req, res) => {
  const [books, transactions] = await Promise.all([readTable('tbl_book'), readTable('tbl_transaction')]);
  const borrowed = transactions.filter(tx => tx.userId === req.auth.sub && tx.action === 'borrowed' && !transactions.some(ret => ret.bookId === tx.bookId && ret.action === 'returned' && Date.parse(ret.timestamp) > Date.parse(tx.timestamp)));
  ok(res, borrowed.map(tx => ({ ...tx, book: books.find(book => book.id === tx.bookId) || null })));
});
router.get('/books', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase(); let books = await readTable('tbl_book');
  if (q) books = books.filter(book => [book.title, book.author, book.isbn].some(value => String(value || '').toLowerCase().includes(q)));
  ok(res, books);
});
router.get('/history', async (req, res) => {
  const history = (await readTable('tbl_transaction')).filter(tx => tx.userId === req.auth.sub).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)); ok(res, history);
});
module.exports = router;
