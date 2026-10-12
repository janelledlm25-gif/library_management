const jwt = require('jsonwebtoken');
const { readTable } = require('../utils/db');

module.exports = async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, data: null, message: 'Authentication required.' });
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    const user = (await readTable('tbl_user')).find(item => item.id === req.auth.sub);
    if (!user) return res.status(401).json({ success: false, data: null, message: 'Account no longer exists.' });
    if (user.status !== 'active') return res.status(403).json({ success: false, data: null, message: 'This account is not active.' });
    if (user.role !== req.auth.role) return res.status(403).json({ success: false, data: null, message: 'Account permissions have changed. Please sign in again.' });
    req.auth.mustChangePassword = Boolean(user.mustChangePassword);
    const authPath = req.originalUrl.split('?')[0];
    if (req.auth.mustChangePassword && !['/api/auth/change-password', '/api/auth/me', '/api/auth/logout'].includes(authPath)) {
      return res.status(403).json({ success: false, data: null, message: 'Change your temporary password before continuing.' });
    }
    next();
  } catch {
    res.status(401).json({ success: false, data: null, message: 'Invalid or expired token.' });
  }
};
