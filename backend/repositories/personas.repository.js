'use strict';

const crypto = require('crypto');
const { query, pool } = require('../config/database');

const TIPOS = ['empleado_interno', 'contratista', 'cliente', 'contacto_ierp'];
const EVENTO_TIPOS = ['task', 'lead', 'lead_vinculo', 'ticket', 'reunion'];
const ROLES = ['asignado', 'etiquetado', 'contratista_levantamiento', 'receptor_cotizacion', 'observador'];
const ACCESO = ['ninguno', 'temporal', 'permanente'];

function mapPersona(r) {
  if (!r) return null;
  return {
    uuid: r.uuid,
    tipo: r.tipo,
    nombre_completo: r.nombre_completo,
    email: r.email,
    telefono: r.telefono,
    empresa: r.empresa,
    division: r.division,
    usuario_uuid: r.usuario_uuid,
    ierp_employee_id: r.ierp_employee_id,
    ierp_contact_id: r.ierp_contact_id,
    acceso_portal: r.acceso_portal,
    acceso_expira_en: r.acceso_expira_en,
    permisos_json: r.permisos_json,
    notas: r.notas,
    activo: r.activo === 1,
    creado_en: r.creado_en,
  };
}

function mapParticipante(r) {
  if (!r) return null;
  return {
    uuid: r.uuid,
    persona_uuid: r.persona_uuid,
    nombre_completo: r.nombre_completo,
    email: r.email,
    tipo: r.tipo_persona,
    empresa: r.empresa,
    evento_tipo: r.evento_tipo,
    evento_ref: r.evento_ref,
    rol_participacion: r.rol_participacion,
    notificar: r.notificar === 1,
    notificado_en: r.notificado_en,
    mensaje: r.mensaje,
    creado_en: r.creado_en,
  };
}

const SELECT_PERSONA = `
  SELECT p.*, u.uuid AS usuario_uuid
    FROM nexus_personas p
    LEFT JOIN usuarios u ON u.id = p.usuario_id
`;

const SELECT_PART = `
  SELECT ep.uuid, ep.evento_tipo, ep.evento_ref, ep.rol_participacion,
         ep.notificar, ep.notificado_en, ep.mensaje, ep.creado_en,
         p.uuid AS persona_uuid, p.nombre_completo, p.email, p.tipo AS tipo_persona, p.empresa
    FROM nexus_evento_participantes ep
    JOIN nexus_personas p ON p.id = ep.persona_id
`;

async function buscarPersonas(filtros) {
  const params = [];
  let sql = `${SELECT_PERSONA} WHERE p.activo = 1`;
  if (filtros.tipo && TIPOS.includes(filtros.tipo)) {
    sql += ` AND p.tipo = ?`;
    params.push(filtros.tipo);
  }
  if (filtros.q) {
    sql += ` AND (p.nombre_completo LIKE ? OR p.email LIKE ? OR p.empresa LIKE ?)`;
    const q = `%${filtros.q.slice(0, 80)}%`;
    params.push(q, q, q);
  }
  sql += ` ORDER BY p.nombre_completo LIMIT 50`;
  const rows = await query(sql, params);
  return rows.map(mapPersona);
}

async function obtenerPersona(uuid) {
  const rows = await query(`${SELECT_PERSONA} WHERE p.uuid = ? LIMIT 1`, [uuid]);
  return mapPersona(rows[0]);
}

async function crearPersona(datos, usuarioId) {
  const uuid = crypto.randomUUID();
  await query(
    `INSERT INTO nexus_personas
       (uuid, tipo, nombre_completo, email, telefono, empresa, division,
        usuario_id, ierp_employee_id, ierp_contact_id, acceso_portal, acceso_expira_en,
        permisos_json, notas, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid,
      datos.tipo || 'contratista',
      datos.nombre_completo,
      datos.email || null,
      datos.telefono || null,
      datos.empresa || null,
      datos.division || 'interno',
      datos.usuario_id || null,
      datos.ierp_employee_id || null,
      datos.ierp_contact_id || null,
      datos.acceso_portal || 'ninguno',
      datos.acceso_expira_en || null,
      datos.permisos_json ? JSON.stringify(datos.permisos_json) : null,
      datos.notas || null,
      usuarioId,
    ],
  );
  return obtenerPersona(uuid);
}

async function actualizarPersona(uuid, patch) {
  const campos = [];
  const params = [];
  const allowed = [
    'tipo', 'nombre_completo', 'email', 'telefono', 'empresa', 'division',
    'ierp_employee_id', 'ierp_contact_id', 'acceso_portal', 'acceso_expira_en', 'notas', 'activo',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      campos.push(`${key} = ?`);
      params.push(key === 'activo' ? (patch[key] ? 1 : 0) : patch[key]);
    }
  }
  if (patch.permisos_json !== undefined) {
    campos.push('permisos_json = ?');
    params.push(patch.permisos_json ? JSON.stringify(patch.permisos_json) : null);
  }
  if (!campos.length) return false;
  params.push(uuid);
  const [result] = await pool.execute(`UPDATE nexus_personas SET ${campos.join(', ')} WHERE uuid = ?`, params);
  return result.affectedRows > 0;
}

async function resolverPersonaId(uuid) {
  const rows = await query(`SELECT id FROM nexus_personas WHERE uuid = ? AND activo = 1 LIMIT 1`, [uuid]);
  return rows[0]?.id || null;
}

async function listarPorEvento(eventoTipo, eventoRef) {
  const rows = await query(
    `${SELECT_PART} WHERE ep.evento_tipo = ? AND ep.evento_ref = ? ORDER BY ep.creado_en`,
    [eventoTipo, eventoRef],
  );
  return rows.map(mapParticipante);
}

async function etiquetarEnEvento(datos, usuarioId) {
  const personaId = await resolverPersonaId(datos.persona_uuid);
  if (!personaId) throw new Error('Persona no encontrada.');

  const uuid = crypto.randomUUID();
  try {
    await query(
      `INSERT INTO nexus_evento_participantes
         (uuid, persona_id, evento_tipo, evento_ref, rol_participacion, notificar, mensaje, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        personaId,
        datos.evento_tipo,
        datos.evento_ref,
        datos.rol_participacion || 'etiquetado',
        datos.notificar !== false ? 1 : 0,
        datos.mensaje || null,
        usuarioId,
      ],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const rows = await query(
        `${SELECT_PART} WHERE ep.persona_id = ? AND ep.evento_tipo = ? AND ep.evento_ref = ? AND ep.rol_participacion = ? LIMIT 1`,
        [personaId, datos.evento_tipo, datos.evento_ref, datos.rol_participacion || 'etiquetado'],
      );
      return mapParticipante(rows[0]);
    }
    throw err;
  }

  const rows = await query(`${SELECT_PART} WHERE ep.uuid = ? LIMIT 1`, [uuid]);
  return mapParticipante(rows[0]);
}

async function quitarEtiqueta(vinculoUuid) {
  const [result] = await pool.execute(`DELETE FROM nexus_evento_participantes WHERE uuid = ?`, [vinculoUuid]);
  return result.affectedRows > 0;
}

async function marcarNotificado(participanteUuid) {
  await query(
    `UPDATE nexus_evento_participantes SET notificado_en = CURRENT_TIMESTAMP WHERE uuid = ?`,
    [participanteUuid],
  );
}

async function registrarNotificacion(datos) {
  const uuid = crypto.randomUUID();
  await query(
    `INSERT INTO nexus_notificaciones_persona
       (uuid, persona_id, participante_id, evento_tipo, evento_ref, canal, estado, asunto, cuerpo, error_msg, enviado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid,
      datos.persona_id,
      datos.participante_id || null,
      datos.evento_tipo,
      datos.evento_ref,
      datos.canal || 'email',
      datos.estado || 'pendiente',
      datos.asunto,
      datos.cuerpo,
      datos.error_msg || null,
      datos.estado === 'enviada' ? new Date() : null,
    ],
  );
  return uuid;
}

async function obtenerParticipante(uuid) {
  const rows = await query(`${SELECT_PART} WHERE ep.uuid = ? LIMIT 1`, [uuid]);
  return mapParticipante(rows[0]);
}

module.exports = {
  TIPOS,
  EVENTO_TIPOS,
  ROLES,
  ACCESO,
  buscarPersonas,
  obtenerPersona,
  crearPersona,
  actualizarPersona,
  listarPorEvento,
  etiquetarEnEvento,
  quitarEtiqueta,
  marcarNotificado,
  registrarNotificacion,
  obtenerParticipante,
  resolverPersonaId,
};
