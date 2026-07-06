'use strict';

const { query, pool } = require('../config/database');

async function obtener(clave) {
  const rows = await query(`SELECT * FROM nexus_config WHERE clave = ? LIMIT 1`, [clave]);
  return rows[0] || null;
}

async function listar(categoria) {
  let sql = `SELECT clave, valor_json, categoria, secreto, actualizado_en FROM nexus_config`;
  const params = [];
  if (categoria) {
    sql += ' WHERE categoria = ?';
    params.push(categoria);
  }
  sql += ' ORDER BY clave';
  return query(sql, params);
}

async function guardar(clave, valorJson, categoria, secreto, usuarioId) {
  const json = JSON.stringify(valorJson);
  const existente = await obtener(clave);
  if (existente) {
    await pool.execute(
      `UPDATE nexus_config SET valor_json = ?, categoria = ?, secreto = ?, actualizado_por = ? WHERE clave = ?`,
      [json, categoria, secreto ? 1 : 0, usuarioId || null, clave],
    );
  } else {
    await pool.execute(
      `INSERT INTO nexus_config (clave, valor_json, categoria, secreto, actualizado_por) VALUES (?, ?, ?, ?, ?)`,
      [clave, json, categoria, secreto ? 1 : 0, usuarioId || null],
    );
  }
  return obtener(clave);
}

module.exports = { obtener, listar, guardar };
