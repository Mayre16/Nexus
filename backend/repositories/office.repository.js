'use strict';

const crypto = require('crypto');
const { query, pool, withTransaction } = require('../config/database');

const DIVISIONES = ['energia', 'deportes'];
const ESTADOS = ['nuevo', 'contactado', 'calificado', 'propuesta', 'ganado', 'perdido'];
const ESTADOS_PROYECTO = ['activo', 'en_verificacion', 'completado', 'archivado', 'cerrado'];
const TIPOS = ['inbound', 'ierp_proyecto'];

function secuenciaLead(division) {
  return division === 'deportes' ? 'lead_deportes' : 'lead_energia';
}

async function siguienteNumero(conn, nombre) {
  await conn.execute(`UPDATE secuencias SET valor = LAST_INSERT_ID(valor + 1) WHERE nombre = ?`, [nombre]);
  const [rows] = await conn.execute(`SELECT LAST_INSERT_ID() AS n`);
  return rows[0].n;
}

function filtrosDivision(usuario, divisionQuery) {
  if (usuario.rol === 'admin' || usuario.division === 'ambas') {
    if (divisionQuery && DIVISIONES.includes(divisionQuery)) return divisionQuery;
    return null;
  }
  return usuario.division === 'deportes' ? 'deportes' : 'energia';
}

function mapLeadRow(r) {
  if (!r) return null;
  return {
    ...r,
    referencia: `#L${r.division === 'deportes' ? 'D' : 'E'}${r.numero}`,
    ierp_quote_url: r.ierp_quote_id
      ? `/ierp.html?tab=cotizaciones&highlight=${r.ierp_quote_id}`
      : null,
  };
}

async function listarLeads(filtros, usuario) {
  const division = filtrosDivision(usuario, filtros.division);
  const params = [];
  let sql = `
    SELECT l.uuid, l.numero, l.division, l.tipo, l.nombre_contacto, l.empresa, l.email, l.telefono,
           l.estado, l.estado_proyecto, l.fuente, l.creado_en, l.actualizado_en,
           l.ierp_tenant_id, l.ierp_quote_id, l.ierp_quote_number, l.ierp_company_name,
           l.ierp_quote_total, l.ierp_quote_currency, l.ierp_auth_status, l.ierp_pipeline_stage,
           ua.nombre_completo AS asignado_nombre,
           c.razon_social AS cliente_nombre,
           (SELECT COUNT(*) FROM lead_vinculos v
             WHERE v.lead_id = l.id AND v.estado IN ('pendiente','en_progreso')) AS pendientes_count
      FROM leads l
      LEFT JOIN usuarios ua ON ua.id = l.asignado_a
      LEFT JOIN clientes_empresa c ON c.id = l.cliente_empresa_id
     WHERE 1=1`;
  if (division) {
    sql += ' AND l.division = ?';
    params.push(division);
  }
  if (filtros.estado && ESTADOS.includes(filtros.estado)) {
    sql += ' AND l.estado = ?';
    params.push(filtros.estado);
  }
  if (filtros.tipo && TIPOS.includes(filtros.tipo)) {
    sql += ' AND l.tipo = ?';
    params.push(filtros.tipo);
  }
  if (filtros.estado_proyecto && ESTADOS_PROYECTO.includes(filtros.estado_proyecto)) {
    sql += ' AND l.estado_proyecto = ?';
    params.push(filtros.estado_proyecto);
  }
  sql += ' ORDER BY l.actualizado_en DESC LIMIT 150';
  const rows = await query(sql, params);
  return rows.map(mapLeadRow);
}

async function crearLead(datos, usuarioId) {
  const uuid = crypto.randomUUID();
  return withTransaction(async (conn) => {
    const numero = await siguienteNumero(conn, secuenciaLead(datos.division));
    const [result] = await conn.execute(
      `INSERT INTO leads (
         uuid, numero, division, tipo, nombre_contacto, empresa, email, telefono,
         estado, estado_proyecto, fuente, notas, creado_por,
         ierp_tenant_id, ierp_quote_id, ierp_quote_number, ierp_company_id, ierp_company_name,
         ierp_quote_total, ierp_quote_currency, ierp_auth_status, ierp_pipeline_stage
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        numero,
        datos.division,
        datos.tipo || 'inbound',
        datos.nombre_contacto,
        datos.empresa || null,
        datos.email || null,
        datos.telefono || null,
        datos.estado || (datos.tipo === 'ierp_proyecto' ? 'propuesta' : 'nuevo'),
        datos.estado_proyecto || (datos.tipo === 'ierp_proyecto' ? 'activo' : null),
        datos.fuente || 'manual',
        datos.notas || null,
        usuarioId,
        datos.ierp_tenant_id || null,
        datos.ierp_quote_id || null,
        datos.ierp_quote_number || null,
        datos.ierp_company_id || null,
        datos.ierp_company_name || null,
        datos.ierp_quote_total ?? null,
        datos.ierp_quote_currency || 'DOP',
        datos.ierp_auth_status || null,
        datos.ierp_pipeline_stage || null,
      ],
    );
    return { id: result.insertId, uuid, numero, division: datos.division };
  });
}

async function actualizarLead(uuid, campos) {
  const sets = [];
  const params = [];
  for (const key of [
    'estado',
    'estado_proyecto',
    'notas',
    'fuente',
    'nombre_contacto',
    'empresa',
    'email',
    'telefono',
    'asignado_a',
  ]) {
    if (campos[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(campos[key]);
    }
  }
  if (!sets.length) return false;
  params.push(uuid);
  const [result] = await pool.execute(`UPDATE leads SET ${sets.join(', ')} WHERE uuid = ?`, params);
  return result.affectedRows > 0;
}

async function obtenerLead(uuid) {
  const rows = await query(
    `SELECT l.*, ua.nombre_completo AS asignado_nombre, c.razon_social AS cliente_nombre
       FROM leads l
       LEFT JOIN usuarios ua ON ua.id = l.asignado_a
       LEFT JOIN clientes_empresa c ON c.id = l.cliente_empresa_id
      WHERE l.uuid = ? LIMIT 1`,
    [uuid],
  );
  return mapLeadRow(rows[0]);
}

async function obtenerLeadPorIerpQuote(tenantId, quoteId) {
  const rows = await query(
    `SELECT l.* FROM leads l
      WHERE l.ierp_tenant_id = ? AND l.ierp_quote_id = ? LIMIT 1`,
    [tenantId, quoteId],
  );
  return rows[0] || null;
}

async function upsertLeadIerpProyecto(datos) {
  const existente = await obtenerLeadPorIerpQuote(datos.ierp_tenant_id, datos.ierp_quote_id);
  if (existente) {
    await pool.execute(
      `UPDATE leads SET
         nombre_contacto = ?, empresa = ?, email = ?, telefono = ?,
         ierp_quote_number = ?, ierp_company_id = ?, ierp_company_name = ?,
         ierp_quote_total = ?, ierp_quote_currency = ?,
         ierp_auth_status = ${datos.ierp_auth_status != null ? '?' : 'ierp_auth_status'},
         ierp_pipeline_stage = ${datos.ierp_pipeline_stage ? '?' : 'ierp_pipeline_stage'},
         estado = ?, estado_proyecto = ?, notas = COALESCE(?, notas),
         actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        datos.nombre_contacto,
        datos.ierp_company_name || datos.empresa,
        datos.email || null,
        datos.telefono || null,
        datos.ierp_quote_number,
        datos.ierp_company_id || null,
        datos.ierp_company_name || null,
        datos.ierp_quote_total ?? null,
        datos.ierp_quote_currency || 'DOP',
        ...(datos.ierp_auth_status != null ? [datos.ierp_auth_status] : []),
        ...(datos.ierp_pipeline_stage ? [datos.ierp_pipeline_stage] : []),
        datos.estado || 'propuesta',
        datos.estado_proyecto || 'activo',
        datos.notas || null,
        existente.id,
      ],
    );
    return { uuid: existente.uuid, created: false, id: existente.id };
  }

  const creado = await crearLead(
    {
      ...datos,
      tipo: 'ierp_proyecto',
      fuente: 'ierp_cotizacion',
      estado: 'propuesta',
      estado_proyecto: 'activo',
    },
    null,
  );
  return { ...creado, created: true };
}

async function sincronizarEstadoIerp(tenantId, quoteId, quoteStatus, extras = {}) {
  const lead = await obtenerLeadPorIerpQuote(tenantId, quoteId);
  if (!lead) return null;

  let estado = lead.estado;
  let estadoProyecto = lead.estado_proyecto;
  const auth = extras.quote_authorization_status || extras.auth_status;
  const stageName = extras.pipeline_stage_name;

  if (['CONFIRMED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED'].includes(quoteStatus)) {
    estado = 'ganado';
    estadoProyecto = 'completado';
  } else if (quoteStatus === 'CANCELLED' || auth === 'REJECTED') {
    estado = 'perdido';
    estadoProyecto = 'archivado';
  } else if (auth === 'PENDING') {
    estado = 'propuesta';
    estadoProyecto = 'activo';
  } else if (auth === 'APPROVED') {
    estado = 'propuesta';
    estadoProyecto = 'activo';
  } else if (quoteStatus === 'QUOTE') {
    estadoProyecto = estadoProyecto || 'activo';
  }

  if (stageName) {
    const s = stageName.toLowerCase();
    if (s.includes('calif')) estado = 'calificado';
    else if (s.includes('prop')) estado = 'propuesta';
    else if (s.includes('gan')) estado = 'ganado';
    else if (s.includes('perd')) estado = 'perdido';
    else if (s.includes('contact')) estado = 'contactado';
  }

  await pool.execute(
    `UPDATE leads SET estado = ?, estado_proyecto = ?,
       ierp_auth_status = ${auth !== undefined && auth !== null ? '?' : 'ierp_auth_status'},
       ierp_pipeline_stage = ${stageName ? '?' : 'ierp_pipeline_stage'},
       actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      estado,
      estadoProyecto,
      ...(auth !== undefined && auth !== null ? [auth] : []),
      ...(stageName ? [stageName] : []),
      lead.id,
    ],
  );

  return { uuid: lead.uuid, estado, estado_proyecto: estadoProyecto };
}

async function archivarLeadIerp(tenantId, quoteId) {
  return sincronizarEstadoIerp(tenantId, quoteId, 'CANCELLED');
}

module.exports = {
  DIVISIONES,
  ESTADOS,
  ESTADOS_PROYECTO,
  TIPOS,
  filtrosDivision,
  listarLeads,
  crearLead,
  actualizarLead,
  obtenerLead,
  obtenerLeadPorIerpQuote,
  upsertLeadIerpProyecto,
  sincronizarEstadoIerp,
  archivarLeadIerp,
};
