'use strict';

const crypto = require('crypto');
const { query, pool } = require('../config/database');
const { normalizarImportEquipo } = require('../services/grid-import.service');

const PROPIEDADES = ['sin_clasificar', 'adesa_prueba', 'easymetering', 'cliente'];
const ESTADOS = ['online', 'offline', 'advertencia_offline', 'desconocido'];
const PLATAFORMAS = ['adesa_cloud'];

async function listarEquipos(filtros = {}) {
  const params = [];
  let sql = `
    SELECT e.*, c.razon_social AS cliente_nombre
      FROM grid_easymetering_equipos e
      LEFT JOIN clientes_empresa c ON c.id = e.cliente_empresa_id
     WHERE 1=1`;
  if (filtros.plataforma) {
    sql += ' AND e.plataforma = ?';
    params.push(filtros.plataforma);
  }
  if (filtros.estado && ESTADOS.includes(filtros.estado)) {
    sql += ' AND e.estado_conexion = ?';
    params.push(filtros.estado);
  }
  if (filtros.propiedad && PROPIEDADES.includes(filtros.propiedad)) {
    sql += ' AND e.propiedad = ?';
    params.push(filtros.propiedad);
  }
  if (filtros.sin_asignar === '1') {
    sql += ' AND e.asignado_portal = 0';
  }
  if (filtros.sin_cliente === '1') {
    sql += ` AND e.asignado_portal = 0
             AND e.propiedad NOT IN ('adesa_prueba', 'easymetering')
             AND e.cliente_empresa_id IS NULL`;
  }
  if (filtros.sin_clasificar === '1') {
    sql += " AND e.propiedad = 'sin_clasificar'";
  }
  if (filtros.buscar) {
    sql += ' AND (e.serial LIKE ? OR e.nombre LIKE ? OR e.external_id LIKE ?)';
    const t = `%${filtros.buscar}%`;
    params.push(t, t, t);
  }
  sql += ' ORDER BY e.asignado_portal ASC, e.estado_conexion DESC, e.nombre ASC LIMIT 500';
  return query(sql, params);
}

async function obtenerEquipo(uuid) {
  const rows = await query(
    `SELECT e.*, c.razon_social AS cliente_nombre
       FROM grid_easymetering_equipos e
       LEFT JOIN clientes_empresa c ON c.id = e.cliente_empresa_id
      WHERE e.uuid = ? LIMIT 1`,
    [uuid],
  );
  return rows[0] || null;
}

async function actualizarEquipo(uuid, patch) {
  const campos = [];
  const params = [];
  if (patch.propiedad !== undefined) {
    if (!PROPIEDADES.includes(patch.propiedad)) throw new Error('Propiedad inválida');
    campos.push('propiedad = ?');
    params.push(patch.propiedad);
    if (patch.propiedad === 'adesa_prueba' || patch.propiedad === 'easymetering') {
      campos.push('cliente_empresa_id = NULL');
    }
  }
  if (patch.cliente_empresa_id !== undefined) {
    campos.push('cliente_empresa_id = ?');
    params.push(patch.cliente_empresa_id || null);
    if (patch.cliente_empresa_id) {
      campos.push("propiedad = 'cliente'");
    }
  }
  if (patch.notas !== undefined) {
    campos.push('notas = ?');
    params.push(patch.notas || null);
  }
  if (!campos.length) return obtenerEquipo(uuid);
  params.push(uuid);
  await query(`UPDATE grid_easymetering_equipos SET ${campos.join(', ')} WHERE uuid = ?`, params);
  return obtenerEquipo(uuid);
}

async function resumen(filtros = {}) {
  const params = [];
  let where = '1=1';
  if (filtros.plataforma) {
    where += ' AND plataforma = ?';
    params.push(filtros.plataforma);
  }
  const [totales] = await query(
    `SELECT
      COUNT(*) AS total,
      SUM(estado_conexion = 'online') AS online,
      SUM(estado_conexion = 'offline') AS offline,
      SUM(estado_conexion = 'advertencia_offline') AS advertencia_offline,
      SUM(asignado_portal = 1) AS asignados_portal,
      SUM(asignado_portal = 0) AS sin_asignar_portal,
      SUM(propiedad = 'sin_clasificar' AND asignado_portal = 0) AS sin_clasificar,
      SUM(propiedad = 'adesa_prueba') AS adesa_prueba,
      SUM(propiedad = 'easymetering') AS easymetering,
      SUM(propiedad = 'cliente' OR (asignado_portal = 1 AND cliente_empresa_id IS NOT NULL)) AS con_cliente_nexus
    FROM grid_easymetering_equipos WHERE ${where}`,
    params,
  );
  const mes = filtros.mes || new Date().toISOString().slice(0, 7);
  const [consumo] = await query(
    `SELECT COALESCE(SUM(l.kwh), 0) AS kwh_mes, COUNT(DISTINCT l.equipo_id) AS equipos_con_lectura
       FROM grid_easymetering_lecturas l
       INNER JOIN grid_easymetering_equipos e ON e.id = l.equipo_id
      WHERE DATE_FORMAT(l.fecha, '%Y-%m') = ? ${filtros.plataforma ? 'AND e.plataforma = ?' : ''}`,
    filtros.plataforma ? [mes, filtros.plataforma] : [mes],
  );
  const [ultimaSync] = await query(
    `SELECT * FROM grid_easymetering_sync ORDER BY inicio_en DESC LIMIT 1`,
  );
  return { totales: totales || {}, consumo_mes: consumo || {}, ultima_sync: ultimaSync || null, mes };
}

async function informeMes(mes, plataforma = 'adesa_cloud') {
  const equipos = await query(
    `SELECT e.id, e.uuid, e.serial, e.nombre, e.plataforma, e.propiedad, e.asignado_portal,
            e.estado_conexion, c.razon_social AS cliente_nombre
       FROM grid_easymetering_equipos e
       LEFT JOIN clientes_empresa c ON c.id = e.cliente_empresa_id
      WHERE e.plataforma = ?`,
    [plataforma],
  );

  const dias = await query(
    `SELECT ed.equipo_id,
            SUM(ed.estado_conexion = 'online') AS dias_online,
            SUM(ed.estado_conexion = 'offline') AS dias_offline,
            SUM(ed.estado_conexion = 'advertencia_offline') AS dias_alerta,
            COUNT(*) AS dias_registrados
       FROM grid_easymetering_estado_diario ed
       INNER JOIN grid_easymetering_equipos e ON e.id = ed.equipo_id
      WHERE DATE_FORMAT(ed.fecha, '%Y-%m') = ? AND e.plataforma = ?
      GROUP BY ed.equipo_id`,
    [mes, plataforma],
  );
  const diasMap = new Map(dias.map((d) => [d.equipo_id, d]));

  function bucket(eq) {
    if (eq.propiedad === 'adesa_prueba') return 'adesa_prueba';
    if (eq.propiedad === 'easymetering') return 'easymetering';
    if (eq.asignado_portal) return 'clientes_asignados';
    return 'sin_asignar';
  }

  function clasificarUptime(stats) {
    if (!stats || !stats.dias_registrados) return 'sin_datos';
    const on = Number(stats.dias_online);
    const total = Number(stats.dias_registrados);
    if (on === total && total > 0) return 'todo_mes';
    if (on > 0) return 'parcial';
    return 'offline';
  }

  const grupos = {
    clientes_asignados: { todo_mes: 0, parcial: 0, offline: 0, sin_datos: 0, equipos: [] },
    sin_asignar: { todo_mes: 0, parcial: 0, offline: 0, sin_datos: 0, equipos: [] },
    adesa_prueba: { todo_mes: 0, parcial: 0, offline: 0, sin_datos: 0, equipos: [] },
    easymetering: { todo_mes: 0, parcial: 0, offline: 0, sin_datos: 0, equipos: [] },
  };

  for (const eq of equipos) {
    const g = bucket(eq);
    const stats = diasMap.get(eq.id);
    const uptime = clasificarUptime(stats);
    grupos[g][uptime] += 1;
    grupos[g].equipos.push({
      uuid: eq.uuid,
      serial: eq.serial,
      nombre: eq.nombre,
      propiedad: eq.propiedad,
      cliente_nombre: eq.cliente_nombre,
      uptime,
      dias_online: stats ? Number(stats.dias_online) : 0,
      dias_registrados: stats ? Number(stats.dias_registrados) : 0,
    });
  }

  return { mes, plataforma, grupos };
}

async function lecturasMes(equipoUuid) {
  const eq = await obtenerEquipo(equipoUuid);
  if (!eq) return null;
  const mes = new Date().toISOString().slice(0, 7);
  const filas = await query(
    `SELECT fecha, kwh, monto_estimado FROM grid_easymetering_lecturas
      WHERE equipo_id = ? AND DATE_FORMAT(fecha, '%Y-%m') = ?
      ORDER BY fecha`,
    [eq.id, mes],
  );
  const total = filas.reduce((s, r) => s + Number(r.kwh), 0);
  return { equipo: eq, lecturas: filas, total_kwh_mes: total };
}

async function listarClientesEnergia() {
  return query(
    `SELECT id, uuid, razon_social FROM clientes_empresa
      WHERE division = 'energia' AND activo = 1 ORDER BY razon_social LIMIT 200`,
  );
}

async function listarPlataformas() {
  const rows = await query(
    `SELECT plataforma, COUNT(*) AS total,
            SUM(asignado_portal = 1) AS asignados,
            SUM(asignado_portal = 0) AS sin_asignar
       FROM grid_easymetering_equipos
      GROUP BY plataforma ORDER BY plataforma`,
  );
  return rows;
}

async function listarSyncs(limit = 20) {
  return query(
    `SELECT s.*, u.nombre_completo AS usuario_nombre
       FROM grid_easymetering_sync s
       LEFT JOIN usuarios u ON u.id = s.creado_por
      ORDER BY s.inicio_en DESC LIMIT ?`,
    [limit],
  );
}

async function upsertEquipoDesdeSync(item, syncId = null) {
  const norm = normalizarImportEquipo(item);
  const uuid = crypto.randomUUID();
  const plataforma = norm.plataforma || 'adesa_cloud';
  const hoy = norm.fecha_lectura || new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO grid_easymetering_equipos
       (uuid, external_id, plataforma, serial, nombre, asignado_portal, estado_conexion,
        ultima_lectura_kwh, ultima_lectura_en, ultima_sync_en, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       serial = VALUES(serial),
       nombre = VALUES(nombre),
       asignado_portal = VALUES(asignado_portal),
       estado_conexion = VALUES(estado_conexion),
       ultima_lectura_kwh = VALUES(ultima_lectura_kwh),
       ultima_lectura_en = VALUES(ultima_lectura_en),
       ultima_sync_en = NOW(),
       metadata_json = VALUES(metadata_json)`,
    [
      uuid,
      norm.external_id,
      plataforma,
      norm.serial || null,
      norm.nombre || null,
      norm.asignado_portal ? 1 : 0,
      ESTADOS.includes(norm.estado) ? norm.estado : 'desconocido',
      norm.kwh_dia ?? null,
      norm.lectura_en || null,
      norm.metadata ? JSON.stringify(norm.metadata) : null,
    ],
  );

  const rows = await query(
    `SELECT id FROM grid_easymetering_equipos WHERE plataforma = ? AND external_id = ?`,
    [plataforma, norm.external_id],
  );
  const equipoId = rows[0].id;
  const estado = ESTADOS.includes(norm.estado) ? norm.estado : 'desconocido';

  await query(
    `INSERT INTO grid_easymetering_estado_diario (equipo_id, plataforma, fecha, estado_conexion, sync_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE estado_conexion = VALUES(estado_conexion), sync_id = VALUES(sync_id)`,
    [equipoId, plataforma, hoy, estado, syncId],
  );

  if (norm.kwh_dia != null && hoy) {
    await query(
      `INSERT INTO grid_easymetering_lecturas (equipo_id, fecha, kwh, fuente)
       VALUES (?, ?, ?, 'scrape')
       ON DUPLICATE KEY UPDATE kwh = VALUES(kwh)`,
      [equipoId, hoy, norm.kwh_dia],
    );
  }
  return equipoId;
}

async function registrarSync(data) {
  const [result] = await pool.execute(
    `INSERT INTO grid_easymetering_sync
       (inicio_en, fin_en, estado, equipos_total, equipos_online, equipos_offline, equipos_alerta, mensaje, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.inicio_en,
      data.fin_en || new Date(),
      data.estado || 'ok',
      data.equipos_total || 0,
      data.equipos_online || 0,
      data.equipos_offline || 0,
      data.equipos_alerta || 0,
      data.mensaje || null,
      data.creado_por || null,
    ],
  );
  return result.insertId;
}

module.exports = {
  PROPIEDADES,
  ESTADOS,
  PLATAFORMAS,
  listarEquipos,
  obtenerEquipo,
  actualizarEquipo,
  resumen,
  informeMes,
  lecturasMes,
  listarClientesEnergia,
  listarPlataformas,
  listarSyncs,
  upsertEquipoDesdeSync,
  registrarSync,
};
