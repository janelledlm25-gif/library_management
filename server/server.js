require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const authenticate = require('./middleware/auth');
const adminOnly = require('./middleware/role');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const booksRoutes = require('./routes/books');
const transactionRoutes = require('./routes/transactions');
const logsRoutes = require('./routes/logs');
const dashboardRoutes = require('./routes/dashboard');
const mobileRoutes = require('./routes/mobile');
const adminRoutes = require('./routes/admin');
const portalRoutes = require('./routes/portal');
const rfidRoutes = require('./routes/rfid');
const app = express();
const publicDir = path.join(__dirname, '..', 'public');
const port = Number(process.env.PORT) || 3000;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) throw new Error('JWT_SECRET must be configured with at least 24 characters.');

app.use(cors({
  origin: [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:5500', 'http://127.0.0.1:5500',
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'null'
  ],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir, {
  setHeaders(res) {
    // Revalidate assets so a browser cannot keep an old stylesheet after an update.
    res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok' }, message: 'API ready.' }));
app.use('/api/auth', authRoutes);
app.use('/api/mobile', (req, res, next) => req.path === '/login' ? next() : authenticate(req, res, next), (req, res, next) => req.path === '/login' ? next() : req.auth.role === 'student' ? next() : res.status(403).json({ success: false, data: null, message: 'Student access only.' }), mobileRoutes);

app.use('/api', authenticate);
app.use('/api/admin', adminOnly('admin', 'librarian'), adminRoutes);
app.use('/api/portal', adminOnly('student', 'faculty', 'staff'), portalRoutes);
app.use('/api/rfid', adminOnly('admin', 'librarian'), rfidRoutes);
app.use('/api/transactions', adminOnly('admin', 'librarian'), transactionRoutes);
app.use('/api/logs', adminOnly('admin', 'librarian'), logsRoutes);
app.use('/api/dashboard', adminOnly('admin', 'librarian'), dashboardRoutes);
// Legacy paths are closed explicitly so portal tokens receive 403 rather than falling through.
app.use('/api/users', adminOnly('admin', 'librarian'), (req, res) => res.status(404).json({ success: false, data: null, message: 'Use /api/admin/users.' }));
app.use('/api/books', adminOnly('admin', 'librarian'), booksRoutes);
app.use('/api', (req, res) => res.status(404).json({ success: false, data: null, message: 'API endpoint not found.' }));
app.use(errorHandler);
app.get('*', (req, res) => {
  // Only route extensionless page URLs. Missing CSS, JS, and image files must remain 404s.
  if (path.extname(req.path)) return res.status(404).type('text/plain').send('File not found.');
  if (req.path === '/admin' || req.path.startsWith('/admin/')) return res.sendFile(path.join(publicDir, 'admin', 'home.html'));
  if (req.path === '/portal' || req.path.startsWith('/portal/')) return res.sendFile(path.join(publicDir, 'portal', 'home.html'));
  return res.status(404).type('text/plain').send('Page not found.');
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
