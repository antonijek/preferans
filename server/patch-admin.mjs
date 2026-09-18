import initSqlJs from 'sql.js';
import fs from 'node:fs';
const DB_PATH = process.argv[2];
const USER_ID = Number(process.argv[3]);
const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(DB_PATH));
db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [USER_ID]);
fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
console.log(`Set is_admin=1 for user ${USER_ID}`);
