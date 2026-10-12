const fs = require('node:fs/promises');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const tableFiles = {
  tbl_user: 'tbl_user.json', tbl_book: 'tbl_book.json', tbl_transaction: 'tbl_transaction.json',
  tbl_mobile: 'tbl_mobile.json', tbl_systemMaintenance: 'tbl_systemMaintenance.json'
};
const writeQueues = new Map();

function resolveTable(name) {
  const fileName = tableFiles[name];
  if (!fileName) throw new Error(`Unknown database table: ${name}`);
  return path.join(dataDir, fileName);
}

async function ensureTable(name) {
  const file = resolveTable(name);
  await fs.mkdir(dataDir, { recursive: true });
  try { await fs.access(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { await fs.writeFile(file, '[]\n', { flag: 'wx' }); }
    catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
  }
  return file;
}

async function readTable(name) {
  const file = await ensureTable(name);
  const contents = await fs.readFile(file, 'utf8');
  const data = JSON.parse(contents);
  if (!Array.isArray(data)) throw new Error(`${name} must contain a JSON array`);
  return data;
}

function writeTable(name, data) {
  if (!Array.isArray(data)) return Promise.reject(new TypeError('Table data must be an array'));
  const file = resolveTable(name);
  const previous = writeQueues.get(name) || Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    await fs.mkdir(dataDir, { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    try { await fs.rename(temporary, file); }
    catch (error) { await fs.rm(temporary, { force: true }); throw error; }
  });
  writeQueues.set(name, current);
  return current.finally(() => { if (writeQueues.get(name) === current) writeQueues.delete(name); });
}

module.exports = { readTable, writeTable };
