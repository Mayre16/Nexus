'use strict';

/**
 * usuario.repository.js — Acceso a datos de `usuarios`.
 * ---------------------------------------------------------------------
 * Toda consulta usa placeholders `?` (anti SQLi). Devuelve solo los
 * campos necesarios; nunca expone más de lo requerido por cada caso.
 */

const { query } = require('../config/database');

/**
 * Busca un usuario por email (para login). Incluye password_hash.
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function buscarPorEmail(email) {
  const filas = await query(
    `SELECT id, uuid, nombre_completo, email, password_hash, rol, division,
            cliente_empresa_id, activo, intentos_fallidos, bloqueado_hasta,
            token_version
       FROM usuarios
      WHERE email = ? LIMIT 1`,
    [email]
  );
  return filas[0] || null;
}

/** Incrementa el contador de intentos fallidos de login. */
async function incrementarIntentosFallidos(usuarioId) {
  await query(
    `UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?`,
    [usuarioId]
  );
}

/** Bloquea la cuenta hasta una fecha dada (lockout temporal). */
async function bloquearHasta(usuarioId, fechaHasta) {
  await query(`UPDATE usuarios SET bloqueado_hasta = ? WHERE id = ?`, [
    fechaHasta,
    usuarioId,
  ]);
}

/** Resetea intentos/bloqueo y registra el último login exitoso. */
async function registrarLoginExitoso(usuarioId, refreshHash) {
  await query(
    `UPDATE usuarios
        SET intentos_fallidos = 0,
            bloqueado_hasta = NULL,
            ultimo_login = NOW(),
            refresh_token_hash = ?
      WHERE id = ?`,
    [refreshHash, usuarioId]
  );
}

/** Actualiza solo el hash del refresh token (rotación). */
async function actualizarRefreshHash(usuarioId, refreshHash) {
  await query(`UPDATE usuarios SET refresh_token_hash = ? WHERE id = ?`, [
    refreshHash,
    usuarioId,
  ]);
}

/**
 * Cierra sesión: limpia el refresh e incrementa token_version para
 * invalidar cualquier access token aún vigente.
 */
async function revocarSesiones(usuarioId) {
  await query(
    `UPDATE usuarios
        SET refresh_token_hash = NULL,
            token_version = token_version + 1
      WHERE id = ?`,
    [usuarioId]
  );
}

/** Busca por uuid (para refresh / validaciones). */
async function buscarPorUuid(uuid) {
  const filas = await query(
    `SELECT id, uuid, nombre_completo, email, rol, division, activo,
            refresh_token_hash, token_version
       FROM usuarios
      WHERE uuid = ? LIMIT 1`,
    [uuid]
  );
  return filas[0] || null;
}

/** Lista usuarios para panel admin (sin password). */
async function listarUsuariosAdmin() {
  const rows = await query(
    `SELECT uuid, nombre_completo, email, rol, division, activo, ultimo_login
       FROM usuarios
      ORDER BY nombre_completo`,
  );
  return rows;
}

module.exports = {
  buscarPorEmail,
  buscarPorUuid,
  listarUsuariosAdmin,
  incrementarIntentosFallidos,
  bloquearHasta,
  registrarLoginExitoso,
  actualizarRefreshHash,
  revocarSesiones,
};
