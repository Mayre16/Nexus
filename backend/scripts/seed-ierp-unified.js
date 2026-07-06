'use strict';

/**
 * Registra el tenant iERP en tablas puente Nexus (misma BD MySQL).
 * Tras `npx prisma db push` en iERP, pase el Tenant.id real:
 *   node backend/scripts/seed-ierp-unified.js <tenant-id-cuid>
 */

const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

const TENANT_ID = process.argv[2] || process.env.IERP_DEFAULT_TENANT_ID || 'pending-ierp-tenant';

async function main() {
  const sqlPath = path.join(__dirname, '../../database/migrations/013_ierp_nexus_unified_db.sql');
  const fs = require('fs');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    try {
      await conn.query(fs.readFileSync(sqlPath, 'utf8'));
      console.log('✔ Migración 013 aplicada');
    } catch (e) {
      if (!/Duplicate column|already exists/i.test(e.message)) throw e;
      console.log('· Migración 013 ya presente');
    }

    await conn.query(
      `INSERT INTO ierp_tenants (id, division, nombre, dominio, activo)
       VALUES (?, 'ambas', 'ADESA Nexus', 'adesa.local', 1)
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), dominio = VALUES(dominio), activo = 1`,
      [TENANT_ID],
    );

    const config = {
      version: 1,
      motor: 'mysql',
      tenant_principal_id: TENANT_ID,
      nota: 'BD única: Nexus + iERP. Actualice tenant_principal_id tras prisma db push.',
      division_tenant_map: { energia: TENANT_ID, deportes: TENANT_ID },
      business_line_map: { energia: null, deportes: null },
    };

    await conn.query(
      `INSERT INTO nexus_config (clave, valor_json, categoria, secreto)
       VALUES ('ierp_unified_db', ?, 'integrations', 0)
       ON DUPLICATE KEY UPDATE valor_json = VALUES(valor_json)`,
      [JSON.stringify(config)],
    );

    console.log(`✔ Tenant iERP registrado: ${TENANT_ID}`);
    console.log('  Siguiente paso (ERP):');
    console.log('    cd ../ERP/apps/backend');
    console.log('    set DATABASE_URL=mysql://USER:PASS@localhost:3306/' + process.env.DB_NAME);
    console.log('    npx prisma db push');
    console.log('    node ../../../Nexus/backend/scripts/seed-ierp-unified.js <Tenant.id del seed iERP>');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
