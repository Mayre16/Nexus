'use strict';

/**
 * performance.repository.js — Persistencia de reportes Nexus Tracker.
 */

const crypto = require('crypto');
const { query, pool, withTransaction } = require('../config/database');
const { enriquecerTelemetria, completarGraficoDiario, combinarFuentesApps, num } = require('../utils/appTelemetry');

/** Convierte ISO8601 a DATETIME(3) compatible con MySQL/MariaDB. */
function aDatetimeMysql(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error('Fecha inválida.');
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

async function guardarReporte(dispositivoId, datos) {
  const logUuid = crypto.randomUUID();
  const estadoMap = {
    Active: 'activa',
    Locked: 'bloqueada',
    Idle: 'inactiva',
    Ended: 'desconocida',
  };
  const estado = estadoMap[datos.sessionStatus] || 'desconocida';

  await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO performance_logs
        (uuid, dispositivo_id, periodo_inicio, periodo_fin, estado_sesion,
         segundos_activo, segundos_inactivo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        logUuid,
        dispositivoId,
        aDatetimeMysql(datos.periodStart),
        aDatetimeMysql(datos.periodEnd),
        estado,
        datos.activeSeconds || 0,
        datos.idleSeconds || 0,
      ]
    );
    const logId = result.insertId;

    if (Array.isArray(datos.apps) && datos.apps.length > 0) {
      for (const app of datos.apps) {
        await conn.execute(
          `INSERT INTO performance_app_uso (log_id, proceso, nombre_app, segundos, con_input)
           VALUES (?, ?, ?, ?, ?)`,
          [
            logId,
            String(app.processName || '').slice(0, 120),
            String(app.displayName || app.processName || 'Desconocido').slice(0, 180),
            Math.max(0, parseInt(app.seconds, 10) || 0),
            app.hadUserInput ? 1 : 0,
          ]
        );
      }
    }

    if (Array.isArray(datos.urls) && datos.urls.length > 0) {
      for (const u of datos.urls) {
        await conn.execute(
          `INSERT INTO performance_url_uso (log_id, navegador, url, titulo, segundos)
           VALUES (?, ?, ?, ?, ?)`,
          [
            logId,
            u.browser ? String(u.browser).slice(0, 80) : null,
            String(u.url || '').slice(0, 500),
            u.title ? String(u.title).slice(0, 255) : null,
            Math.max(0, parseInt(u.seconds, 10) || 0),
          ]
        );
      }
    }

    await conn.execute(
      `UPDATE tracker_dispositivos SET ultimo_reporte = NOW() WHERE id = ?`,
      [dispositivoId]
    );
  });

  return logUuid;
}

/** Resumen del día por empleado (admin dashboard). */
async function resumenPorUsuario(fecha) {
  return resumenPorRango(fecha, fecha);
}

/** Resumen por rango de fechas (día, semana, mes). */
async function resumenPorRango(desde, hasta) {
  return query(
    `SELECT u.uuid AS usuario_uuid, u.nombre_completo, u.email,
            d.nombre_equipo, d.uuid AS dispositivo_uuid,
            COUNT(pl.id) AS lotes,
            SUM(pl.segundos_activo) AS seg_activo,
            SUM(pl.segundos_inactivo) AS seg_inactivo,
            MAX(pl.recibido_en) AS ultimo_reporte
       FROM tracker_dispositivos d
       JOIN usuarios u ON u.id = d.usuario_id
       LEFT JOIN performance_logs pl
         ON pl.dispositivo_id = d.id
        AND DATE(pl.periodo_inicio) BETWEEN ? AND ?
      WHERE d.activo = 1
      GROUP BY d.id, u.uuid, u.nombre_completo, u.email, d.nombre_equipo, d.uuid
      ORDER BY u.nombre_completo`,
    [desde, hasta]
  );
}

function resolverRango(queryParams) {
  const hoy = queryParams.fecha || new Date().toISOString().slice(0, 10);
  if (queryParams.desde && queryParams.hasta) {
    return { desde: queryParams.desde, hasta: queryParams.hasta };
  }
  const periodo = queryParams.periodo || 'dia';
  if (periodo === 'semana') {
    const d = new Date(hoy + 'T12:00:00');
    d.setDate(d.getDate() - 6);
    return { desde: d.toISOString().slice(0, 10), hasta: hoy };
  }
  if (periodo === 'mes') {
    const d = new Date(hoy + 'T12:00:00');
    d.setDate(d.getDate() - 29);
    return { desde: d.toISOString().slice(0, 10), hasta: hoy };
  }
  return { desde: hoy, hasta: hoy };
}

const CATEGORIAS_REGLA = new Set(['trabajo', 'investigacion', 'ocio', 'otro', 'oina']);

/** Reglas de categoría por usuario (WhatsApp trabajo, OINA, etc.). */
async function reglasCategoriaUsuario(usuarioId) {
  try {
    return await query(
      `SELECT id, patron, categoria, prioridad, nota
         FROM tracker_reglas_categoria
        WHERE usuario_id = ?
        ORDER BY prioridad DESC, id ASC`,
      [usuarioId]
    );
  } catch (_) {
    return [];
  }
}

/** Convierte palabras clave simples a regex (civis, acropolis → civis|acropolis). */
function normalizarPatronRegla(patron) {
  const raw = String(patron || '').trim();
  if (!raw) throw new Error('Patrón vacío.');
  if (raw.length > 120) throw new Error('Patrón demasiado largo (máx. 120).');
  if (/[|()[\]\\^$.*+?{}]/.test(raw)) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(raw, 'i');
    } catch (_) {
      throw new Error('Expresión regular inválida.');
    }
    return raw;
  }
  const partes = raw.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) throw new Error('Patrón vacío.');
  if (partes.length === 1) return partes[0].slice(0, 120);
  return partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|').slice(0, 120);
}

async function crearReglaCategoria(usuarioId, { patron, categoria, nota, prioridad }) {
  if (!CATEGORIAS_REGLA.has(categoria)) {
    throw new Error('Categoría inválida.');
  }
  const patronNorm = normalizarPatronRegla(patron);
  const prio = Math.min(255, Math.max(0, parseInt(prioridad, 10) || 50));
  const [result] = await pool.execute(
    `INSERT INTO tracker_reglas_categoria (usuario_id, patron, categoria, prioridad, nota)
     VALUES (?, ?, ?, ?, ?)`,
    [usuarioId, patronNorm, categoria, prio, nota ? String(nota).slice(0, 255) : null]
  );
  return { id: result.insertId, patron: patronNorm, categoria, prioridad: prio, nota: nota || null };
}

async function eliminarReglaCategoria(usuarioId, reglaId) {
  const [result] = await pool.execute(
    `DELETE FROM tracker_reglas_categoria WHERE id = ? AND usuario_id = ?`,
    [reglaId, usuarioId]
  );
  return result.affectedRows > 0;
}

/** Detalle de apps/urls de un dispositivo en un rango. */
async function detalleDispositivo(dispositivoUuid, desde, hasta) {
  let dispositivos;
  try {
    dispositivos = await query(
      `SELECT d.id, d.uuid, d.nombre_equipo, d.tipo_equipo, d.usuario_id, u.nombre_completo
         FROM tracker_dispositivos d
         JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.uuid = ? LIMIT 1`,
      [dispositivoUuid]
    );
  } catch (_) {
    dispositivos = await query(
      `SELECT d.id, d.uuid, d.nombre_equipo, d.usuario_id, u.nombre_completo
         FROM tracker_dispositivos d
         JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.uuid = ? LIMIT 1`,
      [dispositivoUuid]
    );
  }
  if (!dispositivos[0]) return null;

  const apps = await query(
    `SELECT pau.nombre_app, pau.proceso, SUM(pau.segundos) AS segundos
       FROM performance_app_uso pau
       JOIN performance_logs pl ON pl.id = pau.log_id
      WHERE pl.dispositivo_id = ? AND DATE(pl.periodo_inicio) BETWEEN ? AND ?
      GROUP BY pau.nombre_app, pau.proceso
      ORDER BY segundos DESC
      LIMIT 30`,
    [dispositivos[0].id, desde, hasta]
  );

  const urls = await query(
    `SELECT pu.url, pu.titulo, pu.navegador, pu.segundos,
            pl.periodo_inicio, pl.periodo_fin
       FROM performance_url_uso pu
       JOIN performance_logs pl ON pl.id = pu.log_id
      WHERE pl.dispositivo_id = ? AND DATE(pl.periodo_inicio) BETWEEN ? AND ?
      ORDER BY pl.periodo_inicio DESC, pu.id DESC
      LIMIT 100`,
    [dispositivos[0].id, desde, hasta]
  );

  const urlsResumen = await query(
    `SELECT pu.url, pu.titulo, pu.navegador, SUM(pu.segundos) AS segundos
       FROM performance_url_uso pu
       JOIN performance_logs pl ON pl.id = pu.log_id
      WHERE pl.dispositivo_id = ? AND DATE(pl.periodo_inicio) BETWEEN ? AND ?
      GROUP BY pu.url, pu.titulo, pu.navegador
      ORDER BY segundos DESC
      LIMIT 20`,
    [dispositivos[0].id, desde, hasta]
  );

  const appsDetalle = await query(
    `SELECT pau.nombre_app, pau.proceso, pau.segundos,
            pl.periodo_inicio, pl.periodo_fin
       FROM performance_app_uso pau
       JOIN performance_logs pl ON pl.id = pau.log_id
      WHERE pl.dispositivo_id = ? AND DATE(pl.periodo_inicio) BETWEEN ? AND ?
      ORDER BY pl.periodo_inicio DESC, pau.id DESC
      LIMIT 100`,
    [dispositivos[0].id, desde, hasta]
  );

  const lotes = await query(
    `SELECT pl.uuid, pl.periodo_inicio, pl.periodo_fin,
            pl.segundos_activo, pl.segundos_inactivo, pl.estado_sesion
       FROM performance_logs pl
      WHERE pl.dispositivo_id = ? AND DATE(pl.periodo_inicio) BETWEEN ? AND ?
      ORDER BY pl.periodo_inicio DESC
      LIMIT 50`,
    [dispositivos[0].id, desde, hasta]
  );

  const graficoDiario = await query(
    `SELECT DATE(pl.periodo_inicio) AS dia,
            SUM(pl.segundos_activo) AS seg_activo
       FROM performance_logs pl
      WHERE pl.dispositivo_id = ? AND DATE(pl.periodo_inicio) BETWEEN ? AND ?
      GROUP BY DATE(pl.periodo_inicio)
      ORDER BY dia ASC`,
    [dispositivos[0].id, desde, hasta]
  );

  const appsSql = apps.map((a) => ({ ...a, segundos: num(a.segundos) }));
  const urlsNorm = urls.map((u) => ({ ...u, segundos: num(u.segundos) }));
  const urlsResumenNorm = urlsResumen.map((u) => ({ ...u, segundos: num(u.segundos) }));

  const appsNorm = combinarFuentesApps(appsSql, appsDetalle, urlsResumenNorm, urlsNorm);

  const reglasUsuario = await reglasCategoriaUsuario(dispositivos[0].usuario_id);
  const ctxClasificacion = {
    tipoEquipo: dispositivos[0].tipo_equipo || 'flota',
    reglasUsuario,
  };

  const telemetria = enriquecerTelemetria(appsNorm, urlsResumenNorm, ctxClasificacion);
  const graficoDiarioFinal = completarGraficoDiario(
    graficoDiario,
    lotes,
    appsNorm,
    urlsResumenNorm,
    hasta
  );

  let appsDetalleFinal = appsDetalle;
  if ((!appsDetalleFinal || appsDetalleFinal.length === 0) && urlsNorm.length > 0) {
    appsDetalleFinal = urlsNorm.slice(0, 100).map((u) => ({
      nombre_app: u.titulo || u.url || 'Web',
      proceso: u.navegador || 'chrome',
      segundos: Math.max(num(u.segundos), 30),
      periodo_inicio: u.periodo_inicio,
      periodo_fin: u.periodo_fin,
    }));
  }

  return {
    dispositivo: dispositivos[0],
    desde,
    hasta,
    apps: appsNorm,
    appsAgente: appsSql,
    appsDetalle: appsDetalleFinal,
    urls: urlsNorm,
    urlsResumen: urlsResumenNorm,
    lotes,
    graficoApps: telemetria.graficoApps,
    graficoDiario: graficoDiarioFinal,
    appsWindows: telemetria.appsWindows,
    appsWeb: telemetria.appsWeb,
    graficoAppsWindows: telemetria.graficoAppsWindows,
    graficoAppsWeb: telemetria.graficoAppsWeb,
    graficoRanking: telemetria.graficoRanking,
    graficoCategorias: telemetria.graficoCategorias,
    graficoProyectosCursor: telemetria.graficoProyectosCursor,
    tipoEquipo: ctxClasificacion.tipoEquipo,
  };
}

module.exports = {
  guardarReporte,
  resumenPorUsuario,
  resumenPorRango,
  resolverRango,
  detalleDispositivo,
  reglasCategoriaUsuario,
  crearReglaCategoria,
  eliminarReglaCategoria,
};
