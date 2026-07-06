'use strict';

/**
 * seed-hub-demo.js — Usuario suscriptor de prueba con Hub, Power Quality y ScrapiBids.
 * Uso: node scripts/seed-hub-demo.js
 */

const crypto = require('crypto');
const { query, cerrarPool, verificarConexion } = require('../config/database');
const { hashPassword } = require('../utils/password');
const umRepo = require('../repositories/usuario-modulos.repository');
const scrapiRepo = require('../repositories/scrapibids.repository');

const EMAIL = 'demo.hub@adesa.com.do';
const PASSWORD = 'HubDemo2026!';
const NOMBRE = 'Cliente Demo Hub';

const MODULOS = ['hub', 'power_quality', 'scrapibids'];

async function main() {
  await verificarConexion();

  let usuarioId;
  const existentes = await query('SELECT id, uuid FROM usuarios WHERE email = ? LIMIT 1', [EMAIL]);

  const hash = await hashPassword(PASSWORD);

  if (existentes.length > 0) {
    usuarioId = existentes[0].id;
    await query(
      `UPDATE usuarios SET password_hash = ?, rol = 'cliente_suscriptor', division = 'energia',
              activo = 1, intentos_fallidos = 0, bloqueado_hasta = NULL, nombre_completo = ?
        WHERE id = ?`,
      [hash, NOMBRE, usuarioId],
    );
    console.log(`✔ Usuario demo ACTUALIZADO: ${EMAIL}`);
  } else {
    const uuid = crypto.randomUUID();
    const result = await query(
      `INSERT INTO usuarios
        (uuid, nombre_completo, email, password_hash, rol, division, activo)
       VALUES (?, ?, ?, ?, 'cliente_suscriptor', 'energia', 1)`,
      [uuid, NOMBRE, EMAIL, hash],
    );
    usuarioId = result.insertId;
    console.log(`✔ Usuario demo CREADO: ${EMAIL}`);
  }

  const adminRows = await query(`SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1 LIMIT 1`);
  const adminId = adminRows[0]?.id || null;

  await umRepo.reemplazarModulos(usuarioId, MODULOS, adminId);

  await scrapiRepo.guardarConfig(usuarioId, {
    palabras_clave: ['transformador', 'UPS', 'Schneider', 'tablero', 'subestación'],
    correo_destino: EMAIL,
    frecuencia: 'diaria',
    hora_ejecucion: '11:00:00',
    dias_semana: '1,2,3,4,5',
    busqueda_publica: true,
    activo: true,
  });

  const planes = await query(`SELECT id, codigo FROM hub_planes WHERE codigo IN ('power_quality','scrapibids')`);
  for (const plan of planes) {
    const ya = await query(
      `SELECT id FROM hub_suscripciones WHERE usuario_id = ? AND plan_id = ? AND estado = 'activa' LIMIT 1`,
      [usuarioId, plan.id],
    );
    if (ya.length) continue;
    await query(
      `INSERT INTO hub_suscripciones (uuid, plan_id, usuario_id, estado, inicio_en, renueva_en, notas)
       VALUES (?, ?, ?, 'activa', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'Demo seed')`,
      [crypto.randomUUID(), plan.id, usuarioId],
    );
    console.log(`✔ Suscripción activa: ${plan.codigo}`);
  }

  console.log('--------------------------------------------------');
  console.log(`  Correo:     ${EMAIL}`);
  console.log(`  Contraseña: ${PASSWORD}`);
  console.log(`  Rol:        cliente_suscriptor`);
  console.log(`  Módulos:    ${MODULOS.join(', ')}`);
  console.log('--------------------------------------------------');

  await cerrarPool();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('✖ Error:', err.message);
  try { await cerrarPool(); } catch (_) { /* noop */ }
  process.exit(1);
});
