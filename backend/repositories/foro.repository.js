'use strict';

const crypto = require('crypto');
const { query } = require('../config/database');

async function listarCategorias(division) {
  const params = [];
  let sql = `SELECT uuid, division, nombre, descripcion FROM portal_foro_categorias WHERE activo = 1`;
  if (division && division !== 'ambas') {
    sql += ' AND (division = ? OR division = "ambas")';
    params.push(division);
  }
  sql += ' ORDER BY orden ASC, nombre ASC';
  return query(sql, params);
}

async function listarTemas(categoriaUuid, limit = 50) {
  const params = [categoriaUuid];
  let sql = `
    SELECT t.uuid, t.titulo, t.autor_nombre, t.cerrado, t.creado_en, t.actualizado_en,
           (SELECT COUNT(*) FROM portal_foro_posts p WHERE p.tema_id = t.id) AS posts
      FROM portal_foro_temas t
      JOIN portal_foro_categorias c ON c.id = t.categoria_id
     WHERE c.uuid = ?`;
  sql += ' ORDER BY t.actualizado_en DESC LIMIT ?';
  params.push(Math.min(limit, 100));
  return query(sql, params);
}

async function obtenerTema(uuid) {
  const rows = await query(
    `SELECT t.uuid, t.titulo, t.autor_nombre, t.cerrado, t.creado_en, t.actualizado_en,
            c.uuid AS categoria_uuid, c.nombre AS categoria_nombre
       FROM portal_foro_temas t
       JOIN portal_foro_categorias c ON c.id = t.categoria_id
      WHERE t.uuid = ? LIMIT 1`,
    [uuid],
  );
  return rows[0] || null;
}

async function listarPosts(temaUuid) {
  return query(
    `SELECT p.uuid, p.contenido, p.autor_nombre, p.creado_en
       FROM portal_foro_posts p
       JOIN portal_foro_temas t ON t.id = p.tema_id
      WHERE t.uuid = ?
      ORDER BY p.creado_en ASC`,
    [temaUuid],
  );
}

async function crearTema({ categoriaUuid, titulo, autorId, autorNombre }) {
  const cat = await query(`SELECT id FROM portal_foro_categorias WHERE uuid = ? LIMIT 1`, [
    categoriaUuid,
  ]);
  if (!cat[0]) throw new Error('Categoría no encontrada.');

  const uuid = crypto.randomUUID();
  await query(
    `INSERT INTO portal_foro_temas (uuid, categoria_id, titulo, autor_id, autor_nombre)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid, cat[0].id, titulo, autorId || null, autorNombre || null],
  );
  return obtenerTema(uuid);
}

async function crearPost({ temaUuid, contenido, autorId, autorNombre }) {
  const tema = await query(`SELECT id FROM portal_foro_temas WHERE uuid = ? LIMIT 1`, [temaUuid]);
  if (!tema[0]) throw new Error('Tema no encontrado.');

  const uuid = crypto.randomUUID();
  await query(
    `INSERT INTO portal_foro_posts (uuid, tema_id, contenido, autor_id, autor_nombre)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid, tema[0].id, contenido, autorId || null, autorNombre || null],
  );
  await query(`UPDATE portal_foro_temas SET actualizado_en = NOW() WHERE id = ?`, [tema[0].id]);
  return { uuid };
}

module.exports = {
  listarCategorias,
  listarTemas,
  obtenerTema,
  listarPosts,
  crearTema,
  crearPost,
};
