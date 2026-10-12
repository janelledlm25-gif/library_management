const express = require('express');
const { v4: uuid } = require('uuid');
const { readTable, writeTable } = require('../utils/db');
const { fail, ok, required, publicUser } = require('../utils/http');
const router = express.Router();
router.post('/scan', async (req, res) => {
  required(req.body, ['rfidUid']);
  const uid = String(req.body.rfidUid).trim();
  const user = (await readTable('tbl_user')).find(item => item.rfidUid && item.rfidUid.toLowerCase() === uid.toLowerCase());
  if (!user) fail(404, 'No account is assigned to this RFID card.');
  if (user.status !== 'active') fail(403, `This account is ${user.status || 'not active'}.`);
  ok(res, publicUser(user), 'RFID user identified.');
});
router.post('/entry', async (req, res) => {
  required(req.body, ['rfidUid']);
  const uid = String(req.body.rfidUid).trim();
  const user = (await readTable('tbl_user')).find(item => item.rfidUid && item.rfidUid.toLowerCase() === uid.toLowerCase() && item.role === 'student');
  if (!user) fail(404, 'Active student RFID was not found.');
  if (user.status !== 'active') fail(403, 'This account is not active.');
  const logs = await readTable('tbl_systemMaintenance');
  const entry = { id: uuid(), userId: user.id, userName: `${user.firstName} ${user.lastName}`.trim(), action: 'entry', timestamp: new Date().toISOString(), logoutTimestamp: null };
  logs.push(entry); await writeTable('tbl_systemMaintenance', logs); ok(res, entry, 'Student entry recorded.', 201);
});
module.exports = router;
