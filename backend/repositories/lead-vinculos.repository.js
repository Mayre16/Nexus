'use strict';

const crypto = require('crypto');
const { query, pool } = require('../config/database');

const TIPOS = [
  'ierp_cotizacion',
  'desk_ticket',
  'ot_levantamiento',
  'ot_verificacion',
  'ot_servicio',
  'nota',
];
const ESTADOS_VINCULO = ['pendiente', 'en_progreso', 'completado', 'cancelado'];
const ASSIGNEE_SOURCES = ['ierp_employee', 'ierp_contact', 'nexus_user'];

async function obtenerLeadIdPorUuid(leadUuid) {
  const rows = await query(`SELECT id FROM leads WHERE uuid = ? LIMIT 1`, [leadUuid]);
  return rows[0]?.id || null;
}

async function listarPorLead(leadId) {
  return query(
    `SELECT v.*, u.nombre_completo AS nexus_asignado_nombre
       FROM lead_vinculos v
       LEFT JOIN usuarios u ON u.id = v.nexus_asignado_id
      WHERE v.lead_id = ?
      ORDER BY v.creado_en DESC`,
    [leadId],
  );
}

async function crearVinculo(leadId, datos, usuarioId) {
  const uuid = crypto.randomUUID();
  const [result] = await pool.execute(
    `INSERT INTO lead_vinculos
      (uuid, lead_id, tipo, titulo, descripcion, referencia_modulo, referencia_id,
       assignee_source, assignee_id, assignee_name, nexus_asignado_id,
       estado, fecha_limite, notificar, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid,
      leadId,
      datos.tipo,
      datos.titulo,
      datos.descripcion || null,
      datos.referencia_modulo || 'nexus',
      datos.referencia_id || null,
      datos.assignee_source || null,
      datos.assignee_id || null,
      datos.assignee_name || null,
      datos.nexus_asignado_id || null,
      datos.estado || 'pendiente',
      datos.fecha_limite || null,
      datos.notificar ? 1 : 0,
      usuarioId || null,
    ],
  );
  return { id: result.insertId, uuid };
}

async function actualizarVinculo(uuid, campos) {
  const sets = [];
  const params = [];
  for (const key of [
    'titulo',
    'descripcion',
    'estado',
    'fecha_limite',
    'assignee_source',
    'assignee_id',
    'assignee_name',
    'nexus_asignado_id',
    'referencia_id',
    'notificar',
    'ierp_invoice_id',
    'facturacion_autorizada',
  ]) {
    if (campos[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(
        key === 'notificar' || key === 'facturacion_autorizada'
          ? campos[key] ? 1 : 0
          : campos[key],
      );
    }
  }
  if (!sets.length) return false;
  params.push(uuid);
  const [result] = await pool.execute(`UPDATE lead_vinculos SET ${sets.join(', ')} WHERE uuid = ?`, params);
  return result.affectedRows > 0;
}

async function obtenerPorUuid(uuid) {
  const rows = await query(`SELECT * FROM lead_vinculos WHERE uuid = ? LIMIT 1`, [uuid]);
  return rows[0] || null;
}

async function contarPendientesPorLead(leadId) {
  const rows = await query(
    `SELECT COUNT(*) AS n FROM lead_vinculos WHERE lead_id = ? AND estado IN ('pendiente','en_progreso')`,
    [leadId],
  );
  return rows[0]?.n || 0;
}

module.exports = {
  TIPOS,
  ESTADOS_VINCULO,
  ASSIGNEE_SOURCES,
  obtenerLeadIdPorUuid,
  listarPorLead,
  crearVinculo,
  actualizarVinculo,
  obtenerPorUuid,
  contarPendientesPorLead,
};
