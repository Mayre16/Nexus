'use strict';

const { query, pool } = require('../config/database');
const { normalizarMac } = require('../utils/redDeviceClassifier');

async function listarAsignacionesMac() {
  try {
    return await query(
      `SELECT r.mac, r.usuario_id, r.alias, r.tipo_dispositivo, r.nota,
              u.uuid AS usuario_uuid, u.nombre_completo
         FROM tracker_red_dispositivos r
         LEFT JOIN usuarios u ON u.id = r.usuario_id`
    );
  } catch (_) {
    return [];
  }
}

async function listarEquiposTracker() {
  return query(
    `SELECT d.nombre_equipo, d.uuid AS dispositivo_uuid,
            u.id AS usuario_id, u.uuid AS usuario_uuid,
            u.nombre_completo, u.email
       FROM tracker_dispositivos d
       JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.activo = 1
      ORDER BY u.nombre_completo`
  );
}

async function listarUsuariosTracker() {
  return query(
    `SELECT DISTINCT u.uuid AS usuario_uuid, u.nombre_completo, u.email
       FROM tracker_dispositivos d
       JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.activo = 1
      ORDER BY u.nombre_completo`
  );
}

async function listarEmpleadosAsignacion() {
  return query(
    `SELECT uuid AS usuario_uuid, nombre_completo, email, division
       FROM usuarios
      WHERE activo = 1 AND rol IN ('admin', 'empleado')
      ORDER BY nombre_completo`
  );
}

const TIPOS_ASIGNABLES = ['pc', 'laptop', 'mac', 'tablet', 'telefono', 'voip', 'impresora', 'streaming', 'otro'];

async function guardarAsignacionMac(macRaw, { usuarioUuid, alias, tipoDispositivo, nota }) {
  const mac = normalizarMac(macRaw);
  if (!mac) throw new Error('MAC inválida.');

  let usuarioId = null;
  if (usuarioUuid) {
    const u = await query(`SELECT id FROM usuarios WHERE uuid = ? AND activo = 1 LIMIT 1`, [usuarioUuid]);
    if (!u[0]) throw new Error('Usuario no encontrado.');
    usuarioId = u[0].id;
  }

  if (tipoDispositivo && !TIPOS_ASIGNABLES.includes(tipoDispositivo)) {
    throw new Error('Tipo de dispositivo inválido.');
  }

  await pool.execute(
    `INSERT INTO tracker_red_dispositivos (mac, usuario_id, alias, tipo_dispositivo, nota)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       usuario_id = VALUES(usuario_id),
       alias = VALUES(alias),
       tipo_dispositivo = VALUES(tipo_dispositivo),
       nota = VALUES(nota)`,
    [
      mac,
      usuarioId,
      alias ? String(alias).slice(0, 120) : null,
      tipoDispositivo || null,
      nota ? String(nota).slice(0, 255) : null,
    ]
  );

  return mac;
}

module.exports = {
  listarAsignacionesMac,
  listarEquiposTracker,
  listarUsuariosTracker,
  listarEmpleadosAsignacion,
  guardarAsignacionMac,
  TIPOS_ASIGNABLES,
};
