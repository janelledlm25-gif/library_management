function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function ok(res, data, message = 'OK', status = 200) { return res.status(status).json({ success: true, data, message }); }
function required(body, fields) { for (const field of fields) if (body[field] === undefined || String(body[field]).trim() === '') fail(400, `${field} is required.`); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '')); }
function publicUser(user) { const { passwordHash, ...safe } = user; return safe; }
module.exports = { fail, ok, required, validEmail, publicUser };
