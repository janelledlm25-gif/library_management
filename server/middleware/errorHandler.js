module.exports = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, data: null, message: status >= 500 ? 'An unexpected server error occurred.' : error.message });
};
