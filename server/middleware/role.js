module.exports = (...roles) => (req, res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) return res.status(403).json({ success: false, data: null, message: 'You do not have permission to do that.' });
  next();
};
