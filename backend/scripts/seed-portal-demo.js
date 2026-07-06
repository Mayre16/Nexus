'use strict';

const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

const DEMO_EMAIL = 'cliente.demo@adesa.com.do';
const DEMO_PASS = 'ClienteDemo1!';

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  let clienteId;
  const [clientes] = await conn.execute(
    `SELECT id FROM clientes_empresa WHERE email_contacto = ? LIMIT 1`,
    [DEMO_EMAIL],
  );
  if (clientes[0]) {
    clienteId = clientes[0].id;
  } else {
    const uuid = crypto.randomUUID();
    const [ins] = await conn.execute(
      `INSERT INTO clientes_empresa (uuid, razon_social, division, tipo_cliente, email_contacto, activo)
       VALUES (?, 'Cliente Demo Portal', 'energia', 'externo', ?, 1)`,
      [uuid, DEMO_EMAIL],
    );
    clienteId = ins.insertId;
    console.log('Cliente demo creado:', uuid);
  }

  const hash = await bcrypt.hash(DEMO_PASS, 12);
  const userUuid = crypto.randomUUID();
  const [exist] = await conn.execute(`SELECT id FROM usuarios WHERE email = ?`, [DEMO_EMAIL]);
  if (exist[0]) {
    await conn.execute(
      `UPDATE usuarios SET password_hash = ?, rol = 'cliente_externo', cliente_empresa_id = ?, activo = 1, division = 'energia'
       WHERE id = ?`,
      [hash, clienteId, exist[0].id],
    );
    console.log('Usuario demo actualizado');
  } else {
    await conn.execute(
      `INSERT INTO usuarios (uuid, nombre_completo, email, password_hash, rol, division, cliente_empresa_id, activo)
       VALUES (?, 'Carlos Demo Portal', ?, ?, 'cliente_externo', 'energia', ?, 1)`,
      [userUuid, DEMO_EMAIL, hash, clienteId],
    );
    console.log('Usuario demo creado');
  }

  await conn.end();
  console.log('');
  console.log('=== Portal demo ===');
  console.log(`  URL:      ${process.env.NEXUS_PUBLIC_URL || 'http://localhost:3000'}/portal.html`);
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASS}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
