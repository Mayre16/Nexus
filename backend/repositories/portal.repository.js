'use strict';

const crypto = require('crypto');
const { query, pool } = require('../config/database');

const ROLES_CLIENTE = ['cliente_externo', 'cliente_suscriptor'];
const INVITE_TTL_DIAS = 7;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function buscarInvitacionPorToken(token) {
  const hash = hashToken(token);
  const rows = await query(
    `SELECT i.uuid, i.tipo, i.expira_en, i.usado_en,
            u.id AS usuario_id, u.uuid AS usuario_uuid, u.email, u.nombre_completo,
            u.activo, u.rol, u.division, u.cliente_empresa_id
       FROM nexus_invitaciones_portal i
       JOIN usuarios u ON u.id = i.usuario_id
      WHERE i.token_hash = ? AND i.usado_en IS NULL
      LIMIT 1`,
    [hash],
  );
  return rows[0] || null;
}

async function crearInvitacion({ usuarioId, personaId, creadoPor, tipo = 'invitacion' }) {
  const uuid = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + INVITE_TTL_DIAS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO nexus_invitaciones_portal
       (uuid, token_hash, usuario_id, persona_id, tipo, expira_en, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid, hashToken(token), usuarioId, personaId || null, tipo, expira, creadoPor || null],
  );
  return { uuid, token, expira_en: expira };
}

async function marcarInvitacionUsada(uuid) {
  await query(`UPDATE nexus_invitaciones_portal SET usado_en = NOW() WHERE uuid = ?`, [uuid]);
}

async function crearUsuarioCliente(datos) {
  const uuid = crypto.randomUUID();
  const placeholder = crypto.randomBytes(24).toString('hex');
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(placeholder, 12);

  let clienteId = datos.cliente_empresa_id || null;
  if (!clienteId && datos.cliente_empresa_uuid) {
    const c = await query(`SELECT id FROM clientes_empresa WHERE uuid = ? LIMIT 1`, [
      datos.cliente_empresa_uuid,
    ]);
    clienteId = c[0]?.id || null;
  }

  const [result] = await pool.execute(
    `INSERT INTO usuarios
       (uuid, nombre_completo, email, password_hash, rol, division, cliente_empresa_id, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      uuid,
      datos.nombre_completo,
      datos.email.toLowerCase().trim(),
      passwordHash,
      datos.rol || 'cliente_externo',
      datos.division || 'energia',
      clienteId,
    ],
  );
  return { id: result.insertId, uuid };
}

async function activarUsuario(usuarioId, passwordHash) {
  await query(
    `UPDATE usuarios SET password_hash = ?, activo = 1, intentos_fallidos = 0, bloqueado_hasta = NULL
      WHERE id = ?`,
    [passwordHash, usuarioId],
  );
}

async function vincularPersonaUsuario(personaUuid, usuarioId) {
  await query(`UPDATE nexus_personas SET usuario_id = ? WHERE uuid = ?`, [usuarioId, personaUuid]);
}

async function obtenerClienteEmpresa(id) {
  if (!id) return null;
  const rows = await query(
    `SELECT id, uuid, razon_social, email_contacto, division FROM clientes_empresa WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function listarTicketsCliente(clienteEmpresaId, filtros = {}) {
  const params = [clienteEmpresaId];
  let sql = `
    SELECT t.uuid, t.numero, t.division, t.asunto, t.estado, t.prioridad, t.canal,
           t.creado_en, t.actualizado_en, t.cerrado_en, t.satisfaccion,
           ua.nombre_completo AS asignado_nombre
      FROM tickets t
      LEFT JOIN usuarios ua ON ua.id = t.asignado_a
     WHERE t.cliente_empresa_id = ?`;
  if (filtros.estado) {
    sql += ' AND t.estado = ?';
    params.push(filtros.estado);
  }
  sql += ' ORDER BY t.actualizado_en DESC LIMIT 100';
  return query(sql, params);
}

async function contarTicketsCliente(clienteEmpresaId) {
  return query(
    `SELECT estado, COUNT(*) AS total FROM tickets WHERE cliente_empresa_id = ? GROUP BY estado`,
    [clienteEmpresaId],
  );
}

async function ticketPerteneceCliente(uuid, clienteEmpresaId) {
  const rows = await query(
    `SELECT id, uuid, numero, division, asunto, estado, prioridad, canal, descripcion,
            email_remitente, creado_en, actualizado_en, cerrado_en, satisfaccion,
            cliente_empresa_id, asignado_a
       FROM tickets WHERE uuid = ? AND cliente_empresa_id = ? LIMIT 1`,
    [uuid, clienteEmpresaId],
  );
  return rows[0] || null;
}

async function listarSeguimientosCliente(ticketId) {
  return query(
    `SELECT s.id, s.tipo, s.contenido, s.creado_en,
            u.nombre_completo AS autor_nombre
       FROM ticket_seguimientos s
       LEFT JOIN usuarios u ON u.id = s.autor_id
      WHERE s.ticket_id = ? AND s.tipo != 'nota_interna'
      ORDER BY s.creado_en ASC`,
    [ticketId],
  );
}

async function registrarSatisfaccion(uuid, clienteEmpresaId, valor) {
  const [result] = await pool.execute(
    `UPDATE tickets SET satisfaccion = ? WHERE uuid = ? AND cliente_empresa_id = ? AND estado IN ('resuelto','cerrado')`,
    [valor, uuid, clienteEmpresaId],
  );
  return result.affectedRows > 0;
}

module.exports = {
  ROLES_CLIENTE,
  INVITE_TTL_DIAS,
  hashToken,
  buscarInvitacionPorToken,
  crearInvitacion,
  marcarInvitacionUsada,
  crearUsuarioCliente,
  activarUsuario,
  vincularPersonaUsuario,
  obtenerClienteEmpresa,
  listarTicketsCliente,
  contarTicketsCliente,
  ticketPerteneceCliente,
  listarSeguimientosCliente,
  registrarSatisfaccion,
};
