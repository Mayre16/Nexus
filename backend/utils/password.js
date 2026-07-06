'use strict';

/**
 * password.js — Hash y verificación de contraseñas con bcrypt (D5).
 * ---------------------------------------------------------------------
 * - NUNCA se guarda la contraseña en texto plano: solo su hash bcrypt.
 * - Cost factor 12 (buen equilibrio seguridad/rendimiento en cPanel).
 * - bcrypt incorpora salt único por hash automáticamente.
 */

const bcrypt = require('bcryptjs');

const COST = 12;

// Política mínima de contraseña (se valida también en el endpoint).
const MIN_LONGITUD = 8;

/**
 * Genera el hash de una contraseña.
 * @param {string} textoPlano
 * @returns {Promise<string>}
 */
async function hashPassword(textoPlano) {
  if (typeof textoPlano !== 'string' || textoPlano.length < MIN_LONGITUD) {
    throw new Error(`La contraseña debe tener al menos ${MIN_LONGITUD} caracteres.`);
  }
  return bcrypt.hash(textoPlano, COST);
}

/**
 * Verifica una contraseña contra su hash. Devuelve true/false.
 * bcrypt.compare es resistente a timing attacks por diseño.
 * @param {string} textoPlano
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verificarPassword(textoPlano, hash) {
  if (!textoPlano || !hash) return false;
  try {
    return await bcrypt.compare(textoPlano, hash);
  } catch (_) {
    return false;
  }
}

module.exports = { hashPassword, verificarPassword, MIN_LONGITUD };
