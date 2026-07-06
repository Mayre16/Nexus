'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../database/migrations/015_grid_easymetering.sql'),
    'utf8',
  );
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    console.log('Migration 015 applied OK');
  } catch (e) {
    if (/already exists/i.test(e.message)) {
      console.log('Migration 015 already applied');
    } else throw e;
  }
  await conn.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
