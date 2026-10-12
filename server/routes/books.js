const express = require('express');
const { v4: uuid } = require('uuid');
const { readTable, writeTable } = require('../utils/db');
const { fail, ok, required } = require('../utils/http');
const router = express.Router();
const bookStatuses = ['available', 'borrowed', 'lost', 'damaged'];
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase(); const category = String(req.query.category || '').trim().toLowerCase(); let books = await readTable('tbl_book');
  if (q) books = books.filter(book => [book.title, book.author, book.isbn, book.accessionNo].some(value => String(value || '').toLowerCase().includes(q)));
  if (category) books = books.filter(book => String(book.category || '').toLowerCase() === category);
  ok(res, books);
});
router.post('/', async (req, res) => {
  required(req.body, ['accessionNo', 'title', 'author', 'isbn', 'category']); const books = await readTable('tbl_book');
  const accessionNo = String(req.body.accessionNo).trim();
  if (books.some(book => book.accessionNo?.toLowerCase() === accessionNo.toLowerCase())) fail(409, 'Accession number is already in use.');
  const copies = Number(req.body.copies || 1); if (!Number.isInteger(copies) || copies < 1) fail(400, 'Copies must be a positive whole number.');
  const book = { id: uuid(), accessionNo, title: req.body.title.trim(), author: req.body.author.trim(), isbn: req.body.isbn.trim(), category: req.body.category.trim(), copies, status: 'available', createdAt: new Date().toISOString() };
  books.push(book); await writeTable('tbl_book', books); ok(res, book, 'Book created.', 201);
});
router.put('/:id', async (req, res) => {
  const books = await readTable('tbl_book'); const index = books.findIndex(book => book.id === req.params.id); if (index < 0) fail(404, 'Book not found.');
  if (req.body.accessionNo !== undefined) {
    const accessionNo = String(req.body.accessionNo).trim();
    if (books.some((book, i) => i !== index && book.accessionNo?.toLowerCase() === accessionNo.toLowerCase())) fail(409, 'Accession number is already in use.');
    books[index].accessionNo = accessionNo;
  }
  for (const key of ['title', 'author', 'isbn', 'category']) if (req.body[key] !== undefined) books[index][key] = String(req.body[key]).trim();
  if (req.body.copies !== undefined) { const copies = Number(req.body.copies); if (!Number.isInteger(copies) || copies < 1) fail(400, 'Copies must be a positive whole number.'); books[index].copies = copies; }
  if (req.body.status !== undefined) { if (!bookStatuses.includes(req.body.status)) fail(400, 'Invalid book status.'); books[index].status = req.body.status; }
  await writeTable('tbl_book', books); ok(res, books[index], 'Book updated.');
});
router.delete('/:id', async (req, res) => {
  const books = await readTable('tbl_book'); const next = books.filter(book => book.id !== req.params.id);
  if (next.length === books.length) fail(404, 'Book not found.');
  if (books.find(book => book.id === req.params.id).status === 'borrowed') fail(409, 'A currently borrowed book cannot be deleted.');
  await writeTable('tbl_book', next); ok(res, { id: req.params.id }, 'Book deleted.');
});
module.exports = router;
