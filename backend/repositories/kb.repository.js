'use strict';

const crypto = require('crypto');
const { query } = require('../config/database');

async function listarPublicos(division, buscar) {
  const params = [];
  let sql = `
    SELECT uuid, division, titulo, tags, creado_en, actualizado_en,
           LEFT(contenido, 200) AS resumen
      FROM knowledge_base_howto
     WHERE publicado = 1`;
  if (division && division !== 'ambas') {
    sql += ' AND division = ?';
    params.push(division);
  }
  if (buscar) {
    sql += ' AND (titulo LIKE ? OR contenido LIKE ? OR tags LIKE ?)';
    const q = `%${buscar.slice(0, 80)}%`;
    params.push(q, q, q);
  }
  sql += ' ORDER BY actualizado_en DESC LIMIT 100';
  return query(sql, params);
}

async function obtenerPublico(uuid) {
  const rows = await query(
    `SELECT uuid, division, titulo, contenido, tags, creado_en, actualizado_en
       FROM knowledge_base_howto WHERE uuid = ? AND publicado = 1 LIMIT 1`,
    [uuid],
  );
  return rows[0] || null;
}

async function listarAdmin(division) {
  const params = [];
  let sql = `SELECT uuid, division, titulo, publicado, tags, creado_en, actualizado_en
               FROM knowledge_base_howto WHERE 1=1`;
  if (division) {
    sql += ' AND division = ?';
    params.push(division);
  }
  sql += ' ORDER BY actualizado_en DESC LIMIT 200';
  return query(sql, params);
}

async function crear(datos, autorId) {
  const uuid = crypto.randomUUID();
  await query(
    `INSERT INTO knowledge_base_howto (uuid, division, titulo, contenido, tags, autor_id, publicado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid,
      datos.division || 'energia',
      datos.titulo,
      datos.contenido,
      datos.tags || null,
      autorId || null,
      datos.publicado !== false ? 1 : 0,
    ],
  );
  return obtenerAdmin(uuid);
}

async function obtenerAdmin(uuid) {
  const rows = await query(
    `SELECT uuid, division, titulo, contenido, tags, publicado, creado_en, actualizado_en
       FROM knowledge_base_howto WHERE uuid = ? LIMIT 1`,
    [uuid],
  );
  return rows[0] || null;
}

async function actualizar(uuid, patch) {
  const sets = [];
  const params = [];
  for (const key of ['titulo', 'contenido', 'tags', 'division']) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(patch[key]);
    }
  }
  if (patch.publicado !== undefined) {
    sets.push('publicado = ?');
    params.push(patch.publicado ? 1 : 0);
  }
  if (!sets.length) return false;
  params.push(uuid);
  await query(`UPDATE knowledge_base_howto SET ${sets.join(', ')} WHERE uuid = ?`, params);
  return true;
}

module.exports = { listarPublicos, obtenerPublico, listarAdmin, crear, obtenerAdmin, actualizar };
