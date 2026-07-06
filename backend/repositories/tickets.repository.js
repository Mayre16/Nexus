'use strict';

const crypto = require('crypto');
const { query, pool, withTransaction } = require('../config/database');

const ESTADOS = ['abierto', 'en_proceso', 'en_espera', 'resuelto', 'cerrado'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
const DIVISIONES = ['energia', 'deportes'];

function secuenciaNombre(division) {
  return division === 'deportes' ? 'ticket_deportes' : 'ticket_energia';
}

async function siguienteNumero(conn, division) {
  const nombre = secuenciaNombre(division);
  await conn.execute(
    `UPDATE secuencias SET valor = LAST_INSERT_ID(valor + 1) WHERE nombre = ?`,
    [nombre]
  );
  const [rows] = await conn.execute(`SELECT LAST_INSERT_ID() AS n`);
  return rows[0].n;
}

function filtrosDivision(usuario, divisionQuery) {
  if (usuario.rol === 'admin' || usuario.division === 'ambas') {
    if (divisionQuery && DIVISIONES.includes(divisionQuery)) return divisionQuery;
    return null;
  }
  if (usuario.division === 'energia' || usuario.division === 'deportes') {
    return usuario.division;
  }
  return 'energia';
}

async function listarTickets(filtros, usuario) {
  const division = filtrosDivision(usuario, filtros.division);
  const params = [];
  let sql = `
    SELECT t.uuid, t.numero, t.division, t.asunto, t.estado, t.prioridad, t.canal,
           t.email_remitente, t.creado_en, t.actualizado_en, t.cerrado_en,
           c.razon_social AS cliente_nombre,
           uc.nombre_completo AS creador_nombre,
           ua.nombre_completo AS asignado_nombre
      FROM tickets t
      LEFT JOIN clientes_empresa c ON c.id = t.cliente_empresa_id
      LEFT JOIN usuarios uc ON uc.id = t.creado_por
      LEFT JOIN usuarios ua ON ua.id = t.asignado_a
     WHERE 1=1`;

  if (division) {
    sql += ' AND t.division = ?';
    params.push(division);
  }
  if (filtros.estado && ESTADOS.includes(filtros.estado)) {
    sql += ' AND t.estado = ?';
    params.push(filtros.estado);
  }
  if (filtros.buscar) {
    sql += ' AND (t.asunto LIKE ? OR t.email_remitente LIKE ? OR CAST(t.numero AS CHAR) LIKE ?)';
    const q = `%${filtros.buscar}%`;
    params.push(q, q, q);
  }

  sql += ' ORDER BY t.actualizado_en DESC LIMIT ?';
  params.push(Math.min(parseInt(filtros.limit, 10) || 100, 200));

  return query(sql, params);
}

async function obtenerPorUuid(uuid) {
  const rows = await query(
    `SELECT t.*,
            c.razon_social AS cliente_nombre, c.email_contacto AS cliente_email,
            uc.nombre_completo AS creador_nombre, uc.uuid AS creador_uuid,
            ua.nombre_completo AS asignado_nombre, ua.uuid AS asignado_uuid
       FROM tickets t
       LEFT JOIN clientes_empresa c ON c.id = t.cliente_empresa_id
       LEFT JOIN usuarios uc ON uc.id = t.creado_por
       LEFT JOIN usuarios ua ON ua.id = t.asignado_a
      WHERE t.uuid = ? LIMIT 1`,
    [uuid]
  );
  return rows[0] || null;
}

async function obtenerPorNumeroDivision(numero, division) {
  const rows = await query(
    `SELECT * FROM tickets WHERE numero = ? AND division = ? LIMIT 1`,
    [numero, division]
  );
  return rows[0] || null;
}

async function buscarClientePorEmail(email, division) {
  if (!email) return null;
  const rows = await query(
    `SELECT id, razon_social, email_contacto FROM clientes_empresa
      WHERE email_contacto = ? AND division = ? LIMIT 1`,
    [email, division]
  );
  return rows[0] || null;
}

async function listarSeguimientos(ticketId) {
  return query(
    `SELECT s.id, s.tipo, s.contenido, s.email_message_id, s.creado_en,
            u.nombre_completo AS autor_nombre
       FROM ticket_seguimientos s
       LEFT JOIN usuarios u ON u.id = s.autor_id
      WHERE s.ticket_id = ?
      ORDER BY s.creado_en ASC`,
    [ticketId]
  );
}

async function crearTicket(datos, usuarioId) {
  const uuid = crypto.randomUUID();
  return withTransaction(async (conn) => {
    const numero = await siguienteNumero(conn, datos.division);
    const [result] = await conn.execute(
      `INSERT INTO tickets
        (numero, uuid, cliente_empresa_id, division, creado_por, asignado_a,
         asunto, descripcion, canal, estado, prioridad, email_message_id, email_remitente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numero,
        uuid,
        datos.cliente_empresa_id || null,
        datos.division,
        usuarioId || null,
        datos.asignado_a || null,
        datos.asunto,
        datos.descripcion || null,
        datos.canal || 'web',
        datos.estado || 'abierto',
        datos.prioridad || 'media',
        datos.email_message_id || null,
        datos.email_remitente || null,
      ]
    );
    const ticketId = result.insertId;

    if (datos.descripcion) {
      await conn.execute(
        `INSERT INTO ticket_seguimientos (ticket_id, autor_id, tipo, contenido)
         VALUES (?, ?, 'sistema', ?)`,
        [ticketId, usuarioId, datos.descripcion]
      );
    }

    return { id: ticketId, uuid, numero, division: datos.division };
  });
}

async function crearTicketDesdeCorreo(datos) {
  const uuid = crypto.randomUUID();
  return withTransaction(async (conn) => {
    const numero = await siguienteNumero(conn, datos.division);
    const [result] = await conn.execute(
      `INSERT INTO tickets
        (numero, uuid, cliente_empresa_id, division, asunto, descripcion, canal,
         estado, prioridad, email_message_id, email_remitente)
       VALUES (?, ?, ?, ?, ?, ?, 'imap', 'abierto', ?, ?, ?)`,
      [
        numero,
        uuid,
        datos.cliente_empresa_id || null,
        datos.division,
        datos.asunto,
        datos.descripcion || '',
        datos.prioridad || 'media',
        datos.email_message_id,
        datos.email_remitente,
      ]
    );
    const ticketId = result.insertId;
    await conn.execute(
      `INSERT INTO ticket_seguimientos (ticket_id, tipo, contenido, email_message_id)
       VALUES (?, 'correo_entrante', ?, ?)`,
      [ticketId, datos.descripcion || datos.asunto, datos.email_message_id]
    );
    return { id: ticketId, uuid, numero, division: datos.division };
  });
}

async function agregarSeguimiento(ticketId, { autorId, tipo, contenido, emailMessageId }) {
  const [result] = await pool.execute(
    `INSERT INTO ticket_seguimientos (ticket_id, autor_id, tipo, contenido, email_message_id)
     VALUES (?, ?, ?, ?, ?)`,
    [ticketId, autorId || null, tipo, contenido, emailMessageId || null]
  );
  await pool.execute(`UPDATE tickets SET actualizado_en = NOW() WHERE id = ?`, [ticketId]);
  return result.insertId;
}

async function actualizarTicket(uuid, campos) {
  const permitidos = [
    'estado', 'prioridad', 'asignado_a', 'asunto', 'descripcion',
    'tiempo_invertido_min', 'informe_resolucion',
  ];
  const sets = [];
  const params = [];
  for (const key of permitidos) {
    if (campos[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(campos[key]);
    }
  }
  if (campos.estado === 'cerrado' || campos.estado === 'resuelto') {
    sets.push('cerrado_en = NOW()');
  }
  if (!sets.length) return false;
  params.push(uuid);
  const [result] = await pool.execute(
    `UPDATE tickets SET ${sets.join(', ')} WHERE uuid = ?`,
    params
  );
  return result.affectedRows > 0;
}

async function existeMessageId(messageId) {
  if (!messageId) return false;
  const rows = await query(
    `SELECT id FROM tickets WHERE email_message_id = ? LIMIT 1`,
    [messageId]
  );
  if (rows[0]) return true;
  const seg = await query(
    `SELECT id FROM ticket_seguimientos WHERE email_message_id = ? LIMIT 1`,
    [messageId]
  );
  return Boolean(seg[0]);
}

async function contarPorEstado(usuario, divisionQuery) {
  const division = filtrosDivision(usuario, divisionQuery);
  const params = [];
  let sql = `SELECT estado, COUNT(*) AS total FROM tickets WHERE 1=1`;
  if (division) {
    sql += ' AND division = ?';
    params.push(division);
  }
  sql += ' GROUP BY estado';
  return query(sql, params);
}

async function listarClientesEmpresa(division) {
  const params = [];
  let sql = `SELECT id, uuid, razon_social, email_contacto, division FROM clientes_empresa WHERE activo = 1`;
  if (division) {
    sql += ' AND division = ?';
    params.push(division);
  }
  sql += ' ORDER BY razon_social LIMIT 200';
  try {
    return await query(sql, params);
  } catch (_) {
    return [];
  }
}

module.exports = {
  ESTADOS,
  PRIORIDADES,
  DIVISIONES,
  filtrosDivision,
  listarTickets,
  obtenerPorUuid,
  obtenerPorNumeroDivision,
  buscarClientePorEmail,
  listarSeguimientos,
  crearTicket,
  crearTicketDesdeCorreo,
  agregarSeguimiento,
  actualizarTicket,
  existeMessageId,
  contarPorEstado,
  listarClientesEmpresa,
};
