'use strict';

const crypto = require('crypto');
const { query, pool, withTransaction } = require('../config/database');

const DIVISIONES = ['energia', 'deportes', 'interno'];
const ESTADOS = ['pendiente', 'en_progreso', 'completado', 'archivado'];
const PRIORIDADES = ['baja', 'media', 'alta'];
const ESTADOS_ACTIVOS = ['pendiente', 'en_progreso', 'completado'];

function filtrosDivision(usuario, divisionQuery) {
  if (divisionQuery === 'interno') {
    return { sql: ' AND t.division = ?', params: ['interno'] };
  }
  if (usuario.rol === 'admin' || usuario.division === 'ambas') {
    if (divisionQuery && DIVISIONES.includes(divisionQuery)) {
      return { sql: ' AND t.division = ?', params: [divisionQuery] };
    }
    return { sql: '', params: [] };
  }
  const userDiv = usuario.division === 'deportes' ? 'deportes' : 'energia';
  if (divisionQuery && DIVISIONES.includes(divisionQuery)) {
    if (divisionQuery !== userDiv && divisionQuery !== 'interno') {
      return { sql: ' AND 1=0', params: [] };
    }
    return { sql: ' AND t.division = ?', params: [divisionQuery] };
  }
  return { sql: ' AND t.division IN (?, ?)', params: [userDiv, 'interno'] };
}

function mapTaskRow(r) {
  if (!r) return null;
  let etiquetas = r.etiquetas;
  if (typeof etiquetas === 'string') {
    try {
      etiquetas = JSON.parse(etiquetas);
    } catch {
      etiquetas = [];
    }
  }
  if (!Array.isArray(etiquetas)) etiquetas = [];
  return {
    uuid: r.uuid,
    numero: r.numero,
    referencia: `#TK${r.numero}`,
    division: r.division,
    titulo: r.titulo,
    descripcion: r.descripcion,
    estado: r.estado,
    prioridad: r.prioridad,
    etiquetas,
    lead_uuid: r.lead_uuid,
    ticket_uuid: r.ticket_uuid,
    ierp_activity_id: r.ierp_activity_id,
    asignado_id: r.asignado_id,
    asignado_uuid: r.asignado_uuid,
    asignado_nombre: r.asignado_nombre,
    orden: r.orden,
    fecha_limite: r.fecha_limite,
    completado_en: r.completado_en,
    archivado_en: r.archivado_en,
    creado_por: r.creado_por,
    creado_por_nombre: r.creado_por_nombre,
    creado_en: r.creado_en,
    actualizado_en: r.actualizado_en,
    lead_referencia: r.lead_referencia,
    lead_nombre: r.lead_nombre,
    ticket_referencia: r.ticket_referencia,
  };
}

const SELECT_BASE = `
  SELECT t.uuid, t.numero, t.division, t.titulo, t.descripcion, t.estado, t.prioridad,
         t.etiquetas, t.lead_uuid, t.ticket_uuid, t.ierp_activity_id,
         t.asignado_id, ua.uuid AS asignado_uuid, ua.nombre_completo AS asignado_nombre,
         t.orden, t.fecha_limite, t.completado_en, t.archivado_en,
         t.creado_por, uc.nombre_completo AS creado_por_nombre,
         t.creado_en, t.actualizado_en,
         CASE WHEN l.id IS NOT NULL THEN CONCAT('#L', IF(l.division='deportes','D','E'), l.numero) END AS lead_referencia,
         l.nombre_contacto AS lead_nombre,
         CASE WHEN tk.id IS NOT NULL THEN CONCAT('#T', IF(tk.division='deportes','D','E'), tk.numero) END AS ticket_referencia
    FROM nexus_tasks t
    LEFT JOIN usuarios ua ON ua.id = t.asignado_id
    LEFT JOIN usuarios uc ON uc.id = t.creado_por
    LEFT JOIN leads l ON l.uuid = t.lead_uuid
    LEFT JOIN tickets tk ON tk.uuid = t.ticket_uuid
`;

async function siguienteNumero(conn) {
  await conn.execute(`UPDATE secuencias SET valor = LAST_INSERT_ID(valor + 1) WHERE nombre = 'task_nexus'`);
  const [rows] = await conn.execute(`SELECT LAST_INSERT_ID() AS n`);
  return rows[0].n;
}

async function listar(filtros, usuario) {
  const div = filtrosDivision(usuario, filtros.division);
  const params = [...div.params];
  let sql = `${SELECT_BASE} WHERE 1=1${div.sql}`;

  if (filtros.archivados === '1' || filtros.archivados === true) {
    sql += ` AND t.estado = 'archivado'`;
  } else if (!filtros.incluir_archivados) {
    sql += ` AND t.estado != 'archivado'`;
  }

  if (filtros.estado && ESTADOS.includes(filtros.estado)) {
    sql += ` AND t.estado = ?`;
    params.push(filtros.estado);
  }
  if (filtros.lead_uuid) {
    sql += ` AND t.lead_uuid = ?`;
    params.push(filtros.lead_uuid);
  }
  if (filtros.ticket_uuid) {
    sql += ` AND t.ticket_uuid = ?`;
    params.push(filtros.ticket_uuid);
  }
  if (filtros.asignado_uuid) {
    sql += ` AND ua.uuid = ?`;
    params.push(filtros.asignado_uuid);
  }
  if (filtros.buscar) {
    sql += ` AND (t.titulo LIKE ? OR t.descripcion LIKE ?)`;
    const q = `%${filtros.buscar.slice(0, 80)}%`;
    params.push(q, q);
  }

  sql += ` ORDER BY t.orden ASC, t.actualizado_en DESC LIMIT 300`;
  const rows = await query(sql, params);
  return rows.map(mapTaskRow);
}

async function obtenerPorUuid(uuid) {
  const rows = await query(`${SELECT_BASE} WHERE t.uuid = ? LIMIT 1`, [uuid]);
  return mapTaskRow(rows[0]);
}

async function crear(datos, usuarioId) {
  const uuid = crypto.randomUUID();
  const etiquetas = Array.isArray(datos.etiquetas) ? JSON.stringify(datos.etiquetas.slice(0, 20)) : null;
  return withTransaction(async (conn) => {
    const numero = await siguienteNumero(conn);
    const [result] = await conn.execute(
      `INSERT INTO nexus_tasks
         (uuid, numero, division, titulo, descripcion, estado, prioridad, etiquetas,
          lead_uuid, ticket_uuid, ierp_activity_id, asignado_id, orden, fecha_limite, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        numero,
        datos.division,
        datos.titulo,
        datos.descripcion || null,
        datos.estado || 'pendiente',
        datos.prioridad || 'media',
        etiquetas,
        datos.lead_uuid || null,
        datos.ticket_uuid || null,
        datos.ierp_activity_id || null,
        datos.asignado_id || null,
        datos.orden || 0,
        datos.fecha_limite || null,
        usuarioId,
      ],
    );
    return { uuid, id: result.insertId, numero };
  });
}

async function actualizar(uuid, patch) {
  const campos = [];
  const params = [];

  if (patch.titulo != null) {
    campos.push('titulo = ?');
    params.push(patch.titulo);
  }
  if (patch.descripcion != null) {
    campos.push('descripcion = ?');
    params.push(patch.descripcion);
  }
  if (patch.division && DIVISIONES.includes(patch.division)) {
    campos.push('division = ?');
    params.push(patch.division);
  }
  if (patch.prioridad && PRIORIDADES.includes(patch.prioridad)) {
    campos.push('prioridad = ?');
    params.push(patch.prioridad);
  }
  if (patch.etiquetas != null) {
    campos.push('etiquetas = ?');
    params.push(Array.isArray(patch.etiquetas) ? JSON.stringify(patch.etiquetas.slice(0, 20)) : null);
  }
  if (patch.lead_uuid !== undefined) {
    campos.push('lead_uuid = ?');
    params.push(patch.lead_uuid || null);
  }
  if (patch.ticket_uuid !== undefined) {
    campos.push('ticket_uuid = ?');
    params.push(patch.ticket_uuid || null);
  }
  if (patch.ierp_activity_id !== undefined) {
    campos.push('ierp_activity_id = ?');
    params.push(patch.ierp_activity_id || null);
  }
  if (patch.asignado_id !== undefined) {
    campos.push('asignado_id = ?');
    params.push(patch.asignado_id || null);
  }
  if (patch.orden != null) {
    campos.push('orden = ?');
    params.push(Number(patch.orden) || 0);
  }
  if (patch.fecha_limite !== undefined) {
    campos.push('fecha_limite = ?');
    params.push(patch.fecha_limite || null);
  }
  if (patch.estado && ESTADOS.includes(patch.estado)) {
    campos.push('estado = ?');
    params.push(patch.estado);
    if (patch.estado === 'completado') {
      campos.push('completado_en = CURRENT_TIMESTAMP');
    } else if (patch.estado !== 'archivado') {
      campos.push('completado_en = NULL');
    }
    if (patch.estado === 'archivado') {
      campos.push('archivado_en = CURRENT_TIMESTAMP');
      if (patch.archivado_por) {
        campos.push('archivado_por = ?');
        params.push(patch.archivado_por);
      }
    } else {
      campos.push('archivado_en = NULL', 'archivado_por = NULL');
    }
  }

  if (!campos.length) return false;
  params.push(uuid);
  const [result] = await pool.execute(`UPDATE nexus_tasks SET ${campos.join(', ')} WHERE uuid = ?`, params);
  return result.affectedRows > 0;
}

async function resolverAsignadoId(asignadoUuid) {
  if (!asignadoUuid) return null;
  const rows = await query(
    `SELECT id FROM usuarios WHERE uuid = ? AND activo = 1 AND rol IN ('admin','empleado') LIMIT 1`,
    [asignadoUuid],
  );
  return rows[0]?.id || null;
}

async function resolverUsuarioIdPorUuid(userUuid) {
  const rows = await query(`SELECT id FROM usuarios WHERE uuid = ? LIMIT 1`, [userUuid]);
  return rows[0]?.id || null;
}

module.exports = {
  DIVISIONES,
  ESTADOS,
  ESTADOS_ACTIVOS,
  PRIORIDADES,
  listar,
  obtenerPorUuid,
  crear,
  actualizar,
  resolverAsignadoId,
  resolverUsuarioIdPorUuid,
  filtrosDivision,
};
