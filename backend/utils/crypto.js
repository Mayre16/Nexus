'use strict';

/**
 * crypto.js — Cifrado de datos sensibles en reposo con AES-256-GCM.
 * ---------------------------------------------------------------------
 * Protege (D5): credenciales de conexión a clientes, contraseñas de
 * servidores y configuraciones/credenciales de VPN guardadas en MySQL.
 *
 * ¿Por qué AES-256-GCM?
 *   - Cifrado autenticado (AEAD): además de confidencialidad, garantiza
 *     integridad. Si alguien altera el ciphertext en la BD, el descifrado
 *     FALLA (auth tag inválido) en vez de devolver basura silenciosa.
 *   - IV (nonce) aleatorio de 12 bytes por cada cifrado (NUNCA reutilizar).
 *
 * Formato binario almacenado (VARBINARY en la BD):
 *   [ versión(1) | IV(12) | authTag(16) | ciphertext(n) ]
 *   La versión permite rotar el esquema/clave en el futuro sin ambigüedad.
 *
 * IMPORTANTE: la clave maestra vive SOLO en DATA_ENCRYPTION_KEY (.env),
 * nunca en el código ni en el repositorio (Regla Innegociable #4).
 */

const crypto = require('crypto');
const { env } = require('../config/env');

const ALGORITMO = 'aes-256-gcm';
const VERSION = 0x01; // versión del formato de cifrado
const IV_BYTES = 12; // 96 bits, recomendado para GCM
const TAG_BYTES = 16; // 128 bits de auth tag

// La clave maestra (32 bytes) se deriva del HEX validado en env.js.
const CLAVE_MAESTRA = Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');
if (CLAVE_MAESTRA.length !== 32) {
  // Defensa redundante: env.js ya valida, pero no confiamos a ciegas.
  throw new Error('[CRYPTO] DATA_ENCRYPTION_KEY no produce una clave de 32 bytes.');
}

/**
 * Cifra un texto plano y devuelve un Buffer listo para guardar en VARBINARY.
 * @param {string|null|undefined} textoPlano
 * @returns {Buffer|null}  Buffer cifrado, o null si la entrada es vacía.
 */
function cifrar(textoPlano) {
  if (textoPlano === null || textoPlano === undefined || textoPlano === '') {
    return null;
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITMO, CLAVE_MAESTRA, iv);
  const cifrado = Buffer.concat([
    cipher.update(String(textoPlano), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // [versión][IV][authTag][ciphertext]
  return Buffer.concat([Buffer.from([VERSION]), iv, authTag, cifrado]);
}

/**
 * Descifra un Buffer (leído de VARBINARY) y devuelve el texto plano.
 * Lanza si el dato fue manipulado (auth tag inválido).
 * @param {Buffer|null|undefined} bufferCifrado
 * @returns {string|null}
 */
function descifrar(bufferCifrado) {
  if (!bufferCifrado || bufferCifrado.length === 0) {
    return null;
  }
  const buf = Buffer.isBuffer(bufferCifrado)
    ? bufferCifrado
    : Buffer.from(bufferCifrado);

  const version = buf[0];
  if (version !== VERSION) {
    throw new Error(`[CRYPTO] Versión de cifrado no soportada: ${version}`);
  }
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const authTag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(1 + IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITMO, CLAVE_MAESTRA, iv);
  decipher.setAuthTag(authTag);
  const plano = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plano.toString('utf8');
}

/**
 * Hash determinista (HMAC-SHA256) para búsquedas por campo cifrado sin
 * exponer el valor. Útil para indexar/buscar (ej. host) sin descifrar todo.
 * NO usar para contraseñas de usuario (eso es bcrypt/argon2).
 * @param {string} valor
 * @returns {string} hex
 */
function huellaBusqueda(valor) {
  return crypto
    .createHmac('sha256', CLAVE_MAESTRA)
    .update(String(valor).toLowerCase().trim())
    .digest('hex');
}

/**
 * Comparación en tiempo constante (anti timing-attack) para tokens/HMAC.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function comparacionSegura(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = {
  cifrar,
  descifrar,
  huellaBusqueda,
  comparacionSegura,
};
