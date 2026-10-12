require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const bcrypt = require('bcrypt');
const { v4: uuid } = require('uuid');
const { readTable, writeTable } = require('./utils/db');

async function seed() {
  const users = await readTable('tbl_user'); let books = await readTable('tbl_book');
  const email = 'admin@ccc.edu.ph';
  const plainPassword = 'Admin@CCC2026';
  const existingAdmin = users.find(user => user.role === 'admin' && user.email.toLowerCase() === email)
    || users.find(user => user.role === 'admin');
  if (existingAdmin) console.log('Admin already exists');

  const now = new Date().toISOString();
  let passwordHash = existingAdmin?.passwordHash;
  if (!existingAdmin || (existingAdmin.mustChangePassword === true && !await bcrypt.compare(plainPassword, existingAdmin.passwordHash || ''))) {
    passwordHash = await bcrypt.hash(plainPassword, 10);
  }
  const admin = {
    id: existingAdmin?.id || uuid(),
    firstName: 'Admin',
    lastName: 'CCC',
    email,
    passwordHash,
    course: 'N/A',
    role: 'admin',
    rfidUid: null,
    status: 'active',
    createdAt: existingAdmin?.createdAt || now,
    mustChangePassword: existingAdmin?.mustChangePassword ?? true
  };
  // Seed is intentionally authoritative for accounts: retain only this single admin.
  await writeTable('tbl_user', [admin]);
  for (let i = 0; i < books.length; i++) {
    const legacyAccession = String(books[i].rfidTag || '').replace(/^BOOK-/i, 'ACC-');
    books[i].accessionNo ||= legacyAccession || `ACC-${String(i + 1).padStart(4, '0')}`;
    delete books[i].rfidTag;
    books[i].copies ||= 1;
  }
  const samples = [
    ['Introduction to Computing', 'David Evans', '978-1-23456-001-1', 'ACC-0001', 'Computer Science'],
    ['Clean Code', 'Robert C. Martin', '978-0-13235-088-4', 'ACC-0002', 'Computer Science'],
    ['The Pragmatic Programmer', 'David Thomas and Andrew Hunt', '978-0-13459-662-3', 'ACC-0003', 'Computer Science'],
    ['Database System Concepts', 'Abraham Silberschatz', '978-0-07802-215-9', 'ACC-0004', 'Information Technology'],
    ['Computer Networking', 'James Kurose and Keith Ross', '978-0-13429-346-8', 'ACC-0005', 'Information Technology']
  ];
  for (const [title, author, isbn, accessionNo, category] of samples) if (!books.some(book => book.accessionNo?.toLowerCase() === accessionNo.toLowerCase())) books.push({ id: uuid(), accessionNo, title, author, isbn, category, copies: 1, status: 'available', createdAt: new Date().toISOString() });
  await writeTable('tbl_book', books);
  for (const table of ['tbl_transaction', 'tbl_mobile', 'tbl_systemMaintenance']) await readTable(table);
  const loginPassed = await bcrypt.compare(plainPassword, admin.passwordHash);
  console.log('----------------------------------');
  console.log('ADMIN ACCOUNT CREATED');
  console.log(`Email:          ${email}`);
  console.log(`Plain password: ${plainPassword}`);
  console.log(`Password hash:  ${admin.passwordHash}`);
  console.log(`Hash length:    ${admin.passwordHash.length} characters`);
  console.log('----------------------------------');
  console.log('The plain password is what you type in the login form.');
  console.log('The hash is what is stored in tbl_user.json.');
  console.log("Bcrypt can't be reversed, so the hash cannot be turned back into the password.");
  console.log(`Login test: ${loginPassed ? 'PASSED' : 'FAILED'}`);
  if (!loginPassed) process.exitCode = 1;
}
seed().catch(error => { console.error(error); process.exitCode = 1; });
