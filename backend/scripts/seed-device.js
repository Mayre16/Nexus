'use strict';

/**
 * seed-device.js — Registra un PC Windows (agente BadBoy) vinculado a un usuario Nexus.
 * ---------------------------------------------------------------------
 * Uso:
 *   node scripts/seed-device.js [email] [nombre_equipo]
 *
 * Genera un UUID de dispositivo y un secreto API (imprímelos para config del agente).
 */

const crypto = require('crypto');
const { query, cerrarPool, verificarConexion } = require('../config/database');
const { cifrar } = require('../utils/crypto');

async function main() {
  const email = (process.argv[2] || 'martha@adesa.com.do').toLowerCase().trim();
  const nombreEquipo = process.argv[3] || require('os').hostname();

  await verificarConexion();

  const usuarios = await query('SELECT id, nombre_completo FROM usuarios WHERE email = ? LIMIT 1', [
    email,
  ]);
  if (!usuarios[0]) {
    throw new Error(`No existe usuario con email: ${email}. Ejecuta seed-admin.js primero.`);
  }

  const usuario = usuarios[0];
  const deviceUuid = crypto.randomUUID();
  const apiSecret = crypto.randomBytes(32).toString('hex');
  const secretCifrado = cifrar(apiSecret);

  // Si ya hay dispositivo para este usuario+equipo, actualiza el secreto.
  const existentes = await query(
    `SELECT id, uuid FROM tracker_dispositivos
      WHERE usuario_id = ? AND nombre_equipo = ? LIMIT 1`,
    [usuario.id, nombreEquipo]
  );

  if (existentes[0]) {
    await query(
      `UPDATE tracker_dispositivos
          SET api_secret_cifrado = ?, activo = 1
        WHERE id = ?`,
      [secretCifrado, existentes[0].id]
    );
    console.log('✔ Dispositivo ACTUALIZADO (secreto rotado).');
    console.log('--------------------------------------------------');
    console.log(`  Usuario:       ${email} (${usuario.nombre_completo})`);
    console.log(`  Equipo:        ${nombreEquipo}`);
    console.log(`  Device UUID:   ${existentes[0].uuid}`);
    console.log(`  API Secret:    ${apiSecret}`);
  } else {
    await query(
      `INSERT INTO tracker_dispositivos
        (uuid, usuario_id, nombre_equipo, usuario_windows, api_secret_cifrado, activo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [deviceUuid, usuario.id, nombreEquipo, null, secretCifrado]
    );
    console.log('✔ Dispositivo CREADO.');
    console.log('--------------------------------------------------');
    console.log(`  Usuario:       ${email} (${usuario.nombre_completo})`);
    console.log(`  Equipo:        ${nombreEquipo}`);
    console.log(`  Device UUID:   ${deviceUuid}`);
    console.log(`  API Secret:    ${apiSecret}`);
  }

  console.log('');
  console.log('  Configura el agente BadBoy (nexus.json):');
  console.log('  {');
  console.log('    "NexusApiUrl": "http://localhost:3000",');
  console.log(`    "DeviceUuid": "${existentes[0]?.uuid || deviceUuid}",`);
  console.log(`    "ApiSecret": "${apiSecret}"`);
  console.log('  }');
  console.log('--------------------------------------------------');

  await cerrarPool();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('✖', err.message);
  try {
    await cerrarPool();
  } catch (_) {
    /* noop */
  }
  process.exit(1);
});
