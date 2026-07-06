'use strict';

/**
 * database.js — Pool de conexiones MySQL (mysql2/promise).
 * ---------------------------------------------------------------------
 * Defensas (D3 — Inyección):
 *   - SIEMPRE consultas parametrizadas con placeholders `?`. La función
 *     `query()` exige pasar los parámetros por separado; NUNCA concatenar
 *     entrada del usuario dentro del SQL.
 *   - `multipleStatements: false` evita SQLi por apilamiento de sentencias.
 *   - El pool usa un usuario de BD con MÍNIMO privilegio (solo este schema).
 *
 * Uso típico:
 *   const { query } = require('./config/database');
 *   const filas = await query('SELECT * FROM usuarios WHERE email = ?', [email]);
 */

const mysql = require('mysql2/promise');
const { env } = require('./env');

// Pool reutilizable: gestiona conexiones de forma eficiente y segura.
const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  charset: 'utf8mb4',
  // --- Endurecimiento anti-inyección ---
  multipleStatements: false, // CRÍTICO: impide apilar sentencias (SQLi)
  namedPlaceholders: false,
  // Evita conversión silenciosa de tipos peligrosos
  dateStrings: true,
  timezone: 'Z',
});

/**
 * Ejecuta una consulta parametrizada. Devuelve solo las filas.
 * @param {string} sql  - SQL con placeholders `?` (NUNCA interpolar input).
 * @param {Array<any>} [params] - Valores que reemplazan los placeholders.
 * @returns {Promise<any[]>}
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Obtiene una conexión dedicada para transacciones multi-paso.
 * Recuerda liberar (`connection.release()`) en un finally.
 * @returns {Promise<import('mysql2/promise').PoolConnection>}
 */
async function getConnection() {
  return pool.getConnection();
}

/**
 * Helper de transacción: ejecuta `trabajo(conn)` dentro de una transacción
 * atómica con commit/rollback automático (D6 — anti race conditions).
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} trabajo
 * @returns {Promise<T>}
 * @template T
 */
async function withTransaction(trabajo) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await trabajo(conn);
    await conn.commit();
    return resultado;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Verifica conectividad al arrancar (fail-fast si la BD no responde).
 * @returns {Promise<boolean>}
 */
async function verificarConexion() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

/** Cierra el pool de forma ordenada (apagado del servidor). */
async function cerrarPool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  getConnection,
  withTransaction,
  verificarConexion,
  cerrarPool,
};
