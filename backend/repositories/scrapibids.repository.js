'use strict';

const { query } = require('../config/database');

function parseKeywords(raw) {
  if (Array.isArray(raw)) return raw.map((k) => String(k).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map((k) => String(k).trim()).filter(Boolean);
    } catch (_) {
      return raw.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean);
    }
  }
  return [];
}

async function obtenerConfig(usuarioId) {
  const rows = await query(`SELECT * FROM scrapibids_config WHERE usuario_id = ? LIMIT 1`, [usuarioId]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    palabras_clave: parseKeywords(row.palabras_clave),
  };
}

async function guardarConfig(usuarioId, datos) {
  const keywords = JSON.stringify(parseKeywords(datos.palabras_clave));
  const existente = await obtenerConfig(usuarioId);
  if (existente) {
    await query(
      `UPDATE scrapibids_config SET
         palabras_clave = ?, correo_destino = ?, frecuencia = ?,
         hora_ejecucion = ?, dias_semana = ?, zona_horaria = ?,
         busqueda_publica = ?, activo = ?
       WHERE usuario_id = ?`,
      [
        keywords,
        datos.correo_destino,
        datos.frecuencia || 'diaria',
        datos.hora_ejecucion || '11:00:00',
        datos.dias_semana || '1,2,3,4,5',
        datos.zona_horaria || 'America/Santo_Domingo',
        datos.busqueda_publica !== false ? 1 : 0,
        datos.activo !== false ? 1 : 0,
        usuarioId,
      ],
    );
  } else {
    await query(
      `INSERT INTO scrapibids_config
         (usuario_id, palabras_clave, correo_destino, frecuencia, hora_ejecucion,
          dias_semana, zona_horaria, busqueda_publica, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioId,
        keywords,
        datos.correo_destino,
        datos.frecuencia || 'diaria',
        datos.hora_ejecucion || '11:00:00',
        datos.dias_semana || '1,2,3,4,5',
        datos.zona_horaria || 'America/Santo_Domingo',
        datos.busqueda_publica !== false ? 1 : 0,
        datos.activo !== false ? 1 : 0,
      ],
    );
  }
  return obtenerConfig(usuarioId);
}

async function listarEjecuciones(usuarioId, limite = 20) {
  return query(
    `SELECT id, inicio_en, fin_en, estado, licitaciones_nuevas, mensaje
       FROM scrapibids_ejecuciones
      WHERE usuario_id = ?
      ORDER BY inicio_en DESC
      LIMIT ?`,
    [usuarioId, limite],
  );
}

async function registrarEjecucion(usuarioId, datos) {
  await query(
    `INSERT INTO scrapibids_ejecuciones
       (usuario_id, inicio_en, fin_en, estado, licitaciones_nuevas, mensaje)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      usuarioId,
      datos.inicio_en || new Date(),
      datos.fin_en || new Date(),
      datos.estado || 'ok',
      datos.licitaciones_nuevas || 0,
      datos.mensaje || null,
    ],
  );
  await query(`UPDATE scrapibids_config SET ultima_ejecucion = NOW() WHERE usuario_id = ?`, [usuarioId]);
}

module.exports = {
  obtenerConfig,
  guardarConfig,
  listarEjecuciones,
  registrarEjecucion,
  parseKeywords,
};
