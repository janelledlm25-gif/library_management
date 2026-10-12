const express = require('express');
const { readTable } = require('../utils/db');
const { ok } = require('../utils/http');
const router = express.Router();
function manilaKey(value) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value); }
router.get('/', async (req, res) => {
  const [users, books, transactions, logs] = await Promise.all(['tbl_user', 'tbl_book', 'tbl_transaction', 'tbl_systemMaintenance'].map(readTable));
  const today = manilaKey(new Date()); const borrowedBooks = books.filter(book => book.status === 'borrowed').length;
  const overdueBooks = books.filter(book => book.status === 'borrowed' && transactions.some(tx => tx.bookId === book.id && tx.action === 'borrowed' && !transactions.some(ret => ret.bookId === book.id && ret.action === 'returned' && Date.parse(ret.timestamp) > Date.parse(tx.timestamp)) && tx.dueDate && Date.parse(tx.dueDate) < Date.now())).length;
  const todayEntries = logs.filter(log => log.action === 'entry' && manilaKey(new Date(log.timestamp)) === today).length;
  const recentActivity = transactions.filter(tx => req.auth.role !== 'student' || tx.userId === req.auth.sub).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 10);
  ok(res, { studentsEnteredToday: todayEntries, borrowedBooks, overdueBooks, returnedBooks: transactions.filter(tx => tx.action === 'returned').length, recentActivity, totalUsers: users.length });
});
module.exports = router;
