const express = require('express');
const bcrypt = require('bcrypt');
const { readTable, writeTable } = require('../utils/db');
const { fail, ok, required, validEmail, publicUser } = require('../utils/http');
const router = express.Router();
function activeBorrows(userId, transactions) {
  return transactions.filter(tx => tx.userId === userId && tx.action === 'borrowed' && !transactions.some(other => other.bookId === tx.bookId && other.action === 'returned' && Date.parse(other.timestamp) > Date.parse(tx.timestamp)));
}
router.get('/dashboard', async (req, res) => {
  const transactions = await readTable('tbl_transaction'); const books = await readTable('tbl_book');
  const current = activeBorrows(req.auth.sub, transactions).map(tx => ({ ...tx, book: books.find(book => book.id === tx.bookId) || null }));
  const now = Date.now(); const soon = now + 3 * 86400000;
  ok(res, { borrowedCount: current.length, dueSoonCount: current.filter(tx => tx.dueDate && Date.parse(tx.dueDate) >= now && Date.parse(tx.dueDate) <= soon).length, overdue: current.filter(tx => tx.dueDate && Date.parse(tx.dueDate) < now) });
});
router.get('/books', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase(); const category = String(req.query.category || '').trim().toLowerCase();
  let books = await readTable('tbl_book');
  if (q) books = books.filter(book => [book.title, book.author, book.isbn, book.accessionNo].some(value => String(value || '').toLowerCase().includes(q)));
  if (category) books = books.filter(book => String(book.category || '').toLowerCase() === category);
  ok(res, books.map(({ id, accessionNo, title, author, isbn, category: bookCategory, status, copies }) => ({ id, accessionNo, title, author, isbn, category: bookCategory, status, copies })));
});
router.get('/my-books', async (req, res) => {
  const [transactions, books] = await Promise.all([readTable('tbl_transaction'), readTable('tbl_book')]);
  const current = activeBorrows(req.auth.sub, transactions).map(tx => ({ ...tx, book: books.find(book => book.id === tx.bookId) || null }));
  ok(res, current);
});
router.get('/history', async (req, res) => {
  const history = (await readTable('tbl_transaction')).filter(tx => tx.userId === req.auth.sub).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)); ok(res, history);
});
router.get('/profile', async (req, res) => {
  const user = (await readTable('tbl_user')).find(item => item.id === req.auth.sub);
  if (!user) fail(404, 'Account not found.'); ok(res, publicUser(user));
});
router.put('/profile', async (req, res) => {
  required(req.body, ['firstName', 'lastName']);
  if (req.body.course !== undefined && typeof req.body.course !== 'string') fail(400, 'Course / department must be text.');
  if (req.body.sex !== undefined && !['', 'Male', 'Female', 'Prefer not to say'].includes(req.body.sex)) fail(400, 'Choose a valid sex option.');
  const users = await readTable('tbl_user'); const user = users.find(item => item.id === req.auth.sub);
  if (!user) fail(404, 'Account not found.');
  if (req.body.email !== undefined) {
    if (!validEmail(req.body.email)) fail(400, 'Enter a valid email address.');
    const email = req.body.email.trim().toLowerCase();
    if (users.some(item => item.id !== user.id && item.email.toLowerCase() === email)) fail(409, 'Email is already registered.');
    user.email = email;
  }
  user.firstName = req.body.firstName.trim(); user.lastName = req.body.lastName.trim();
  if (req.body.course !== undefined) user.course = req.body.course.trim();
  if (req.body.sex !== undefined) user.sex = req.body.sex;
  await writeTable('tbl_user', users); ok(res, publicUser(user), 'Profile updated.');
});
module.exports = router;
