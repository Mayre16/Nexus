'use strict';

/**
 * tokens.js — Emisión/verificación de JWT y helpers de cookies HTTPOnly.
 * ---------------------------------------------------------------------
 * Defensas (D2):
 *   - Access token de vida corta + refresh token rotativo.
 *   - Algoritmo fijado a HS256; en verificación se rechaza explícitamente
 *     `alg=none` y cualquier algoritmo distinto al esperado.
 *   - Se exige issuer (iss) y audience (aud) → evita reuso cruzado.
 *   - Los JWT viajan SOLO en cookies HttpOnly + Secure + SameSite (anti XSS).
 */

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const ALGORITMO = 'HS256';

// Nombres de cookie centralizados.
const COOKIE_ACCESS = 'nexus_at';
const COOKIE_REFRESH = 'nexus_rt';
const COOKIE_CSRF = 'nexus_csrf';

/**
 * Opciones base de cookie segura.
 * @param {number} maxAgeMs
 * @param {boolean} httpOnly
 */
function opcionesCookie(maxAgeMs, httpOnly = true) {
  return {
    httpOnly, // el token NO es accesible desde JS (mitiga XSS)
    secure: env.esProduccion, // solo HTTPS en producción
    sameSite: env.esProduccion ? 'strict' : 'lax', // mitiga CSRF
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * Firma un access token con los claims mínimos del usuario.
 * @param {{id:number, uuid:string, rol:string, division:string, tokenVersion:number}} usuario
 * @returns {string}
 */
function firmarAccessToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.uuid, // identificador público (no el id secuencial)
      rol: usuario.rol,
      division: usuario.division,
      tv: usuario.tokenVersion, // permite invalidación masiva
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: ALGORITMO,
      expiresIn: env.JWT_ACCESS_TTL,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }
  );
}

/**
 * Firma un refresh token (claims mínimos).
 * @param {{uuid:string, tokenVersion:number}} usuario
 * @returns {string}
 */
function firmarRefreshToken(usuario) {
  return jwt.sign(
    { sub: usuario.uuid, tv: usuario.tokenVersion, typ: 'refresh' },
    env.JWT_REFRESH_SECRET,
    {
      algorithm: ALGORITMO,
      expiresIn: env.JWT_REFRESH_TTL,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }
  );
}

/**
 * Verifica un access token. Lanza si es inválido/expirado/manipulado.
 * @param {string} token
 * @returns {object} payload
 */
function verificarAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [ALGORITMO], // rechaza alg=none y otros algoritmos
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

/**
 * Verifica un refresh token.
 * @param {string} token
 * @returns {object} payload
 */
function verificarRefreshToken(token) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: [ALGORITMO],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  if (payload.typ !== 'refresh') {
    throw new Error('Tipo de token inválido');
  }
  return payload;
}

module.exports = {
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  COOKIE_CSRF,
  opcionesCookie,
  firmarAccessToken,
  firmarRefreshToken,
  verificarAccessToken,
  verificarRefreshToken,
};
