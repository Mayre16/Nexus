'use strict';

/**
 * seed-admin.js — Crea (o actualiza) un usuario administrador.
 * ---------------------------------------------------------------------
 * Uso:
 *   node scripts/seed-admin.js [email] [password] ["Nombre Completo"]
 *
 * Por defecto crea:  martha@adesa.com.do
 * Si el correo ya existe, actualiza su contraseña y lo deja como admin activo.
 *
 * ⚠ La contraseña por defecto es TEMPORAL. Cámbiala tras el primer acceso.
 */

const crypto = require('crypto');
const { query, cerrarPool, verificarConexion } = require('../config/database');
const { hashPassword } = require('../utils/password');

async function main() {
  const email = (process.argv[2] || 'martha@adesa.com.do').toLowerCase().trim();
  const password = process.argv[3] || 'AdesaNexus2026!';
  const nombre = process.argv[4] || 'Martha (Administrador)';

  await verificarConexion();

  const hash = await hashPassword(password);

  // ¿Existe ya?
  const existentes = await query('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email]);

  if (existentes.length > 0) {
    await query(
      `UPDATE usuarios
          SET password_hash = ?, rol = 'admin', division = 'ambas',
              activo = 1, intentos_fallidos = 0, bloqueado_hasta = NULL
        WHERE email = ?`,
      [hash, email]
    );
    console.log(`✔ Usuario admin ACTUALIZADO: ${email}`);
  } else {
    const uuid = crypto.randomUUID();
    await query(
      `INSERT INTO usuarios
        (uuid, nombre_completo, email, password_hash, rol, division, activo)
       VALUES (?, ?, ?, ?, 'admin', 'ambas', 1)`,
      [uuid, nombre, email, hash]
    );
    console.log(`✔ Usuario admin CREADO: ${email}`);
  }

  console.log('--------------------------------------------------');
  console.log(`  Correo:     ${email}`);
  console.log(`  Contraseña: ${password}`);
  console.log('  Rol:        admin   |   División: ambas');
  console.log('  ⚠ Cambia esta contraseña temporal tras iniciar sesión.');
  console.log('--------------------------------------------------');

  await cerrarPool();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('✖ Error al crear el admin:', err.message);
  try {
    await cerrarPool();
  } catch (_) {
    /* noop */
  }
  process.exit(1);
});
