'use strict';
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  for (const table of ['ierp_tenants', 'nexus_ierp_entidades', 'nexus_ierp_sync_log']) {
    const [t] = await c.query('SHOW TABLES LIKE ?', [table]);
    console.log(table + ':', t.length ? 'OK' : 'MISSING');
  }
  for (const table of ['clientes_empresa', 'productos', 'pedidos', 'pedidos_almacen', 'usuarios', 'almacenes']) {
    const [cols] = await c.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'ierp%'`);
    console.log(table + ' ierp cols:', cols.map((x) => x.Field).join(', ') || '(none)');
  }
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
