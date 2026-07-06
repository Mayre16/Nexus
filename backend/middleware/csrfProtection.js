'use strict';

/**
 * csrfProtection.js — Defensa CSRF por doble envío (double-submit cookie).
 * ---------------------------------------------------------------------
 * Defensa (D4): como autenticamos con cookies, una web maliciosa podría
 * forzar peticiones con la cookie de sesión del usuario. Mitigación en capas:
 *   1) Las cookies de auth ya son SameSite=Strict (primer escudo).
 *   2) Double-submit token: emitimos una cookie `nexus_csrf` (NO HttpOnly,
 *      legible por el front) y exigimos que el cliente reenvíe ese valor en
 *      el header `X-CSRF-Token` en toda petición mutante (POST/PUT/PATCH/DELETE).
 *      Un sitio atacante no puede leer la cookie (Same-Origin Policy), así que
 *      no puede replicar el header.
 *
 * Métodos seguros (GET/HEAD/OPTIONS) no requieren token (no mutan estado).
 */

const crypto = require('crypto');
const { COOKIE_CSRF, opcionesCookie } = require('../utils/tokens');
const { comparacionSegura } = require('../utils/crypto');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_TTL_MS = 1000 * 60 * 60 * 8; // 8 horas

/**
 * Emite/renueva la cookie CSRF si no existe. Colócalo temprano en la cadena.
 */
function emitirTokenCsrf(req, res, next) {
  if (!req.cookies || !req.cookies[COOKIE_CSRF]) {
    const token = crypto.randomBytes(32).toString('hex');
    // NO HttpOnly: el frontend debe leerla para reenviarla en el header.
    res.cookie(COOKIE_CSRF, token, {
      ...opcionesCookie(CSRF_TTL_MS, false),
    });
    // Disponible de inmediato en esta misma request.
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[COOKIE_CSRF];
  }
  next();
}

/**
 * Verifica el token CSRF en peticiones mutantes.
 */
function verificarCsrf(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) {
    return next();
  }
  const cookieToken = req.cookies ? req.cookies[COOKIE_CSRF] : null;
  const headerToken = req.get('X-CSRF-Token');

  if (!cookieToken || !headerToken || !comparacionSegura(cookieToken, headerToken)) {
    return res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
  }
  return next();
}

module.exports = { emitirTokenCsrf, verificarCsrf };
