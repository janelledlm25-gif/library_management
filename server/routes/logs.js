const express = require('express');
const { v4: uuid } = require('uuid');
const { readTable, writeTable } = require('../utils/db');
const { fail, ok, required } = require('../utils/http');
const role = require('../middleware/role');
const router = express.Router();
router.post('/entry', role('admin', 'librarian'), async (req, res) => {
  required(req.body, ['rfidUid']);
  const user = (await readTable('tbl_user')).find(item => item.rfidUid && item.rfidUid === String(req.body.rfidUid).trim() && item.role === 'student');
  if (!user) fail(404, 'Student RFID was not found.');
  const records = await readTable('tbl_systemMaintenance');
  const record = { id: uuid(), userId: user.id, userName: `${user.firstName} ${user.lastName}`.trim(), action: 'entry', timestamp: new Date().toISOString(), logoutTimestamp: null };
  records.push(record); await writeTable('tbl_systemMaintenance', records); ok(res, record, 'Student entry recorded.', 201);
});
router.get('/', async (req, res) => {
  let logs = await readTable('tbl_systemMaintenance');
  if (req.auth.role === 'student') logs = logs.filter(log => log.userId === req.auth.sub);
  logs.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)); ok(res, logs);
});
module.exports = router;
