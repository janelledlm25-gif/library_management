const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuid } = require('uuid');
const { readTable, writeTable } = require('../utils/db');
const { fail, ok, required, validEmail, publicUser } = require('../utils/http');
const router = express.Router();
const roles = ['admin', 'librarian', 'student', 'faculty', 'staff'];
const statuses = ['pending', 'active', 'inactive', 'rejected'];
const bookStatuses = ['available', 'borrowed', 'lost', 'damaged'];

function checkUniqueUser(users, body, exceptId) {
  if (users.some(user => user.id !== exceptId && user.email.toLowerCase() === String(body.email).trim().toLowerCase())) fail(409, 'Email is already registered.');
}

router.get('/users', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const roleFilter = String(req.query.role || '').toLowerCase(); const statusFilter = String(req.query.status || '').toLowerCase();
  let users = (await readTable('tbl_user')).map(publicUser);
  if (q) users = users.filter(user => [user.firstName, user.lastName, user.email].some(value => String(value || '').toLowerCase().includes(q)));
  if (roleFilter) users = users.filter(user => user.role === roleFilter);
  if (statusFilter) users = users.filter(user => user.status === statusFilter);
  ok(res, users);
});

router.post('/users', async (req, res) => {
  required(req.body, ['firstName', 'lastName', 'email', 'password', 'role', 'course']);
  if (!validEmail(req.body.email)) fail(400, 'Enter a valid email address.');
  if (typeof req.body.password !== 'string' || req.body.password.length < 8) fail(400, 'Password must be at least 8 characters long.');
  if (!roles.includes(req.body.role)) fail(400, 'Invalid role.');
  const users = await readTable('tbl_user'); checkUniqueUser(users, req.body);
  if (req.body.role === 'admin') {
    const existingAdmin = users.find(user => user.role === 'admin');
    if (!existingAdmin || existingAdmin.id !== req.auth.sub) fail(403, 'Only the existing admin can create another admin account.');
  }
  if (req.body.rfidUid && users.some(user => user.rfidUid && user.rfidUid === String(req.body.rfidUid).trim())) fail(409, 'RFID card is already assigned to another user.');
  const user = { id: uuid(), firstName: req.body.firstName.trim(), lastName: req.body.lastName.trim(), email: req.body.email.trim().toLowerCase(), passwordHash: await bcrypt.hash(req.body.password, 10), course: req.body.course.trim(), role: req.body.role, rfidUid: req.body.rfidUid ? String(req.body.rfidUid).trim() : null, status: req.body.status && statuses.includes(req.body.status) ? req.body.status : 'active', mustChangePassword: Boolean(req.body.mustChangePassword), createdAt: new Date().toISOString() };
  users.push(user); await writeTable('tbl_user', users); ok(res, publicUser(user), 'Account created.', 201);
});

router.put('/users/:id/approve', async (req, res) => {
  const users = await readTable('tbl_user'); const user = users.find(item => item.id === req.params.id);
  if (!user) fail(404, 'User not found.'); user.status = 'active'; await writeTable('tbl_user', users); ok(res, publicUser(user), 'Account approved.');
});
router.put('/users/:id/reject', async (req, res) => {
  const users = await readTable('tbl_user'); const user = users.find(item => item.id === req.params.id);
  if (!user) fail(404, 'User not found.'); user.status = 'rejected'; await writeTable('tbl_user', users); ok(res, publicUser(user), 'Sign-up rejected.');
});
router.put('/users/:id/status', async (req, res) => {
  required(req.body, ['status']); if (!['active', 'inactive'].includes(req.body.status)) fail(400, 'Status must be active or inactive.');
  const users = await readTable('tbl_user'); const user = users.find(item => item.id === req.params.id);
  if (!user) fail(404, 'User not found.'); if (user.id === req.auth.sub && req.body.status === 'inactive') fail(403, "You can't deactivate your own account.");
  user.status = req.body.status; await writeTable('tbl_user', users); ok(res, publicUser(user), 'Account status updated.');
});
router.put('/users/:id/reset-password', async (req, res) => {
  required(req.body, ['temporaryPassword']);
  if (String(req.body.temporaryPassword).length < 8) fail(400, 'Temporary password must be at least 8 characters long.');
  const users = await readTable('tbl_user'); const user = users.find(item => item.id === req.params.id);
  if (!user) fail(404, 'User not found.');
  user.passwordHash = await bcrypt.hash(req.body.temporaryPassword, 10); user.mustChangePassword = true;
  await writeTable('tbl_user', users); ok(res, publicUser(user), 'Temporary password set; user must change it at next login.');
});
router.put('/users/:id/rfid', async (req, res) => {
  if (req.body.rfidUid !== null && req.body.rfidUid !== undefined && typeof req.body.rfidUid !== 'string') fail(400, 'rfidUid must be a string or null.');
  const uid = typeof req.body.rfidUid === 'string' ? req.body.rfidUid.trim() : null;
  const users = await readTable('tbl_user'); const user = users.find(item => item.id === req.params.id);
  if (!user) fail(404, 'User not found.');
  if (uid && users.some(item => item.id !== user.id && item.rfidUid && item.rfidUid.toLowerCase() === uid.toLowerCase())) fail(409, 'RFID card is already assigned to another user.');
  user.rfidUid = uid || null; await writeTable('tbl_user', users); ok(res, publicUser(user), uid ? 'RFID card assigned.' : 'RFID card cleared.');
});
router.put('/users/:id', async (req, res) => {
  const users = await readTable('tbl_user'); const user = users.find(item => item.id === req.params.id);
  if (!user) fail(404, 'User not found.');
  required(req.body, ['firstName', 'lastName', 'email', 'course', 'role']);
  if (!validEmail(req.body.email)) fail(400, 'Enter a valid email address.');
  if (req.body.sex !== undefined && !['', 'Male', 'Female', 'Prefer not to say'].includes(req.body.sex)) fail(400, 'Choose a valid sex option.');
  if (!roles.includes(req.body.role)) fail(400, 'Invalid role.'); checkUniqueUser(users, req.body, user.id);
  if (req.body.rfidUid && users.some(item => item.id !== user.id && item.rfidUid === String(req.body.rfidUid).trim())) fail(409, 'RFID card is already assigned to another user.');
  for (const key of ['firstName', 'lastName', 'email', 'course', 'role']) user[key] = key === 'email' ? req.body[key].trim().toLowerCase() : req.body[key].trim();
  if (req.body.sex !== undefined) user.sex = req.body.sex;
  if (req.body.rfidUid !== undefined) user.rfidUid = req.body.rfidUid ? String(req.body.rfidUid).trim() : null;
  await writeTable('tbl_user', users); ok(res, publicUser(user), 'Account updated.');
});
router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.auth.sub) fail(403, "You can't delete your own account.");
  const users = await readTable('tbl_user'); const remaining = users.filter(user => user.id !== req.params.id);
  if (remaining.length === users.length) fail(404, 'User not found.');
  await writeTable('tbl_user', remaining); ok(res, { id: req.params.id }, 'Account deleted.');
});

router.get('/books', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase(); const category = String(req.query.category || '').trim().toLowerCase();
  let books = await readTable('tbl_book');
  if (q) books = books.filter(book => [book.title, book.author, book.isbn, book.accessionNo].some(value => String(value || '').toLowerCase().includes(q)));
  if (category) books = books.filter(book => String(book.category || '').toLowerCase() === category);
  ok(res, books);
});
router.post('/books', async (req, res) => {
  required(req.body, ['accessionNo', 'title', 'author', 'isbn', 'category']);
  const books = await readTable('tbl_book'); const accessionNo = String(req.body.accessionNo).trim();
  if (books.some(book => book.accessionNo?.toLowerCase() === accessionNo.toLowerCase())) fail(409, 'Accession number is already in use.');
  const copies = Number(req.body.copies || 1); if (!Number.isInteger(copies) || copies < 1) fail(400, 'Copies must be a positive whole number.');
  const status = req.body.status || 'available'; if (!bookStatuses.includes(status)) fail(400, 'Invalid book status.');
  const book = { id: uuid(), accessionNo, title: req.body.title.trim(), author: req.body.author.trim(), isbn: req.body.isbn.trim(), category: req.body.category.trim(), copies, status, createdAt: new Date().toISOString() };
  books.push(book); await writeTable('tbl_book', books); ok(res, book, 'Book added.', 201);
});
router.put('/books/:id', async (req, res) => {
  const books = await readTable('tbl_book'); const book = books.find(item => item.id === req.params.id);
  if (!book) fail(404, 'Book not found.');
  if (req.body.accessionNo !== undefined) {
    const accessionNo = String(req.body.accessionNo).trim();
    if (books.some(item => item.id !== book.id && item.accessionNo?.toLowerCase() === accessionNo.toLowerCase())) fail(409, 'Accession number is already in use.');
    book.accessionNo = accessionNo;
  }
  for (const key of ['title', 'author', 'isbn', 'category']) if (req.body[key] !== undefined) book[key] = String(req.body[key]).trim();
  if (req.body.copies !== undefined) { const copies = Number(req.body.copies); if (!Number.isInteger(copies) || copies < 1) fail(400, 'Copies must be a positive whole number.'); book.copies = copies; }
  if (req.body.status !== undefined) { if (!bookStatuses.includes(req.body.status)) fail(400, 'Invalid book status.'); book.status = req.body.status; }
  await writeTable('tbl_book', books); ok(res, book, 'Book updated.');
});
router.delete('/books/:id', async (req, res) => {
  const books = await readTable('tbl_book'); const book = books.find(item => item.id === req.params.id);
  if (!book) fail(404, 'Book not found.');
  if (book.status === 'borrowed') fail(409, 'A currently borrowed book cannot be deleted.');
  await writeTable('tbl_book', books.filter(item => item.id !== book.id)); ok(res, { id: book.id }, 'Book deleted.');
});
module.exports = router;
