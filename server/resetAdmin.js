require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const bcrypt = require('bcrypt');
const express = require('express');
const { v4: uuid } = require('uuid');
const { readTable, writeTable } = require('./utils/db');
const authRoutes = require('./routes/auth');

const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'tbl_user.json');
const password = 'Admin@CCC2026';

async function confirmReset() {
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question('Type YES to delete all other accounts: ');
    return answer.trim() === 'YES';
  } finally {
    terminal.close();
  }
}

async function verifyLoginEndpoint(email) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  let logId;
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const result = await response.json();
    logId = result?.data?.logId;
    const passed = response.ok && result.success === true && typeof result.data?.token === 'string';
    console.log(`POST /api/auth/login test: ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) console.log(`Login endpoint message: ${result.message || `HTTP ${response.status}`}`);
    return passed;
  } finally {
    if (logId) {
      const logs = await readTable('tbl_systemMaintenance');
      await writeTable('tbl_systemMaintenance', logs.filter(record => record.id !== logId));
    }
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    throw new Error('JWT_SECRET must be configured with at least 24 characters in server/.env.');
  }
  if (!await confirmReset()) {
    console.log('Reset cancelled. No data was changed.');
    return;
  }

  const backupDir = path.join(dataDir, 'backup');
  await fs.mkdir(backupDir, { recursive: true });
  const backupStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `tbl_user.${backupStamp}.json`);
  await fs.copyFile(usersFile, backupFile);

  const originalUsers = JSON.parse(await fs.readFile(usersFile, 'utf8'));
  if (!Array.isArray(originalUsers)) throw new Error('tbl_user.json must contain a JSON array.');

  const existingAdmin = originalUsers.find(user => user.role === 'admin');
  const adminId = existingAdmin?.id || uuid();
  const adminEmail = existingAdmin?.email || 'admin@ccc.edu.ph';
  const hash = await bcrypt.hash(password, 10);
  const admin = {
    id: adminId,
    firstName: 'Admin',
    lastName: 'CCC',
    email: adminEmail,
    passwordHash: hash,
    course: '',
    role: 'admin',
    rfidUid: null,
    status: 'active',
    mustChangePassword: true,
    createdAt: new Date().toISOString()
  };

  const [mobile, transactions, maintenance] = await Promise.all([
    readTable('tbl_mobile'), readTable('tbl_transaction'), readTable('tbl_systemMaintenance')
  ]);
  const nextMobile = mobile.filter(record => record.userId === adminId);
  const nextTransactions = transactions.filter(record => record.userId === adminId);
  const nextMaintenance = maintenance.filter(record => record.userId === adminId);

  await writeTable('tbl_user', [admin]);
  await Promise.all([
    writeTable('tbl_mobile', nextMobile),
    writeTable('tbl_transaction', nextTransactions),
    writeTable('tbl_systemMaintenance', nextMaintenance)
  ]);

  console.log(`Backup saved: ${backupFile}`);
  console.log(`Mobile records removed: ${mobile.length - nextMobile.length}`);
  console.log(`Transaction records removed: ${transactions.length - nextTransactions.length}`);
  console.log(`System maintenance records removed: ${maintenance.length - nextMaintenance.length}`);

  const passwordValid = await bcrypt.compare(password, hash);
  console.log(`Login test: ${passwordValid ? 'PASSED' : 'FAILED'}`);
  if (!passwordValid) throw new Error('Password hash verification failed.');

  console.log('----------------------------------');
  console.log('ADMIN ACCOUNT READY');
  console.log(`Email:          ${adminEmail}`);
  console.log(`Plain password: ${password}`);
  console.log(`Password hash:  ${hash}`);
  console.log(`Hash length:    ${hash.length} characters`);
  console.log(`Accounts removed: ${originalUsers.length - (existingAdmin ? 1 : 0)}`);
  console.log('Accounts remaining: 1');
  console.log('----------------------------------');
  console.log('The plain password is what you type on the login page.');
  console.log('The hash is what is stored in tbl_user.json.');
  console.log('Bcrypt cannot be reversed, so the hash cannot be turned back into the password.');

  const loginPassed = await verifyLoginEndpoint(adminEmail);
  if (!loginPassed) process.exitCode = 1;
}

main().catch(error => {
  console.error('Admin reset failed:', error.message);
  process.exitCode = 1;
});
