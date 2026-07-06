'use strict';

const { query } = require('../config/database');

async function listarPlanes() {
  return query(
    `SELECT uuid, codigo, nombre, descripcion, precio_mensual, moneda, activo
       FROM hub_planes WHERE activo = 1 ORDER BY nombre`,
  );
}

async function buscarPlanPorCodigo(codigo) {
  const rows = await query(`SELECT * FROM hub_planes WHERE codigo = ? LIMIT 1`, [codigo]);
  return rows[0] || null;
}

async function listarSuscripciones(usuarioId, esAdmin) {
  if (esAdmin) {
    return query(
      `SELECT s.uuid, s.estado, s.inicio_en, s.renueva_en, s.notas,
              p.codigo AS plan_codigo, p.nombre AS plan_nombre,
              u.uuid AS usuario_uuid, u.nombre_completo, u.email
         FROM hub_suscripciones s
         JOIN hub_planes p ON p.id = s.plan_id
         JOIN usuarios u ON u.id = s.usuario_id
        ORDER BY s.creado_en DESC`,
    );
  }
  return query(
    `SELECT s.uuid, s.estado, s.inicio_en, s.renueva_en, s.notas,
            p.codigo AS plan_codigo, p.nombre AS plan_nombre
       FROM hub_suscripciones s
       JOIN hub_planes p ON p.id = s.plan_id
      WHERE s.usuario_id = ?
      ORDER BY s.creado_en DESC`,
    [usuarioId],
  );
}

async function crearSuscripcion({ planId, usuarioId, clienteEmpresaId, estado, inicioEn, renuevaEn, notas }) {
  const crypto = require('crypto');
  const uuid = crypto.randomUUID();
  await query(
    `INSERT INTO hub_suscripciones
       (uuid, plan_id, usuario_id, cliente_empresa_id, estado, inicio_en, renueva_en, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid, planId, usuarioId, clienteEmpresaId || null, estado || 'activa', inicioEn, renuevaEn || null, notas || null],
  );
  return uuid;
}

async function actualizarEstadoSuscripcion(uuid, estado) {
  const extra = estado === 'cancelada' ? ', cancelada_en = NOW()' : '';
  await query(`UPDATE hub_suscripciones SET estado = ?${extra} WHERE uuid = ?`, [estado, uuid]);
}

async function obtenerSuscripcion(uuid) {
  const rows = await query(
    `SELECT s.*, p.codigo AS plan_codigo, p.nombre AS plan_nombre
       FROM hub_suscripciones s
       JOIN hub_planes p ON p.id = s.plan_id
      WHERE s.uuid = ? LIMIT 1`,
    [uuid],
  );
  return rows[0] || null;
}

module.exports = {
  listarPlanes,
  buscarPlanPorCodigo,
  listarSuscripciones,
  crearSuscripcion,
  actualizarEstadoSuscripcion,
  obtenerSuscripcion,
};
