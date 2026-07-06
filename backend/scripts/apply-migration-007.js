'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../database/migrations/007_nexus_leads_proyectos.sql'),
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
    console.log('Migration 007 applied OK');
  } catch (e) {
    if (/Duplicate column|already exists/i.test(e.message)) {
      console.log('Migration 007 already applied:', e.message.split('\n')[0]);
    } else {
      throw e;
    }
  }
  const [cols] = await conn.query("SHOW COLUMNS FROM leads LIKE 'tipo'");
  const [tables] = await conn.query("SHOW TABLES LIKE 'lead_vinculos'");
  console.log('leads.tipo:', cols.length > 0 ? 'OK' : 'MISSING');
  console.log('lead_vinculos:', tables.length > 0 ? 'OK' : 'MISSING');
  await conn.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
