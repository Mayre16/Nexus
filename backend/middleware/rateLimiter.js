'use strict';

/**
 * rateLimiter.js — Limitadores de tasa (D9 — anti DoS / fuerza bruta).
 * ---------------------------------------------------------------------
 * - `limiteGeneral`: aplica a toda la API (ventana amplia).
 * - `limiteLogin`: muy restrictivo en endpoints de autenticación
 *   (login, refresh, recuperación) para frenar fuerza bruta / credential
 *   stuffing. Cuenta por IP + email cuando es posible.
 * - `limiteTracker`: para /api/performance/log (la app badboy reporta cada
 *   5 min por equipo; toleramos ráfagas pero acotamos abuso).
 *
 * Nota cPanel/proxy: el server configura `trust proxy` para que req.ip sea
 * la IP real del cliente y el conteo no se haga contra el proxy.
 */

const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const securityLogger = require('../utils/securityLogger');

/** Handler común que audita el evento al superar el límite. */
function alSuperarLimite(evento) {
  return (req, res, _next, opciones) => {
    securityLogger.registrar({
      evento,
      severidad: 'warning',
      detalle: `rate limit superado (${opciones.max}/${opciones.windowMs}ms)`,
      req,
    });
    res.status(opciones.statusCode).json({
      error: 'Demasiadas solicitudes. Inténtalo más tarde.',
    });
  };
}

// Limitador general de la API.
const limiteGeneral = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true, // expone RateLimit-* (estándar)
  legacyHeaders: false, // oculta X-RateLimit-* (no filtra detalles antiguos)
  handler: alSuperarLimite('RATE_LIMIT_GENERAL'),
});

// Limitador estricto para autenticación (anti fuerza bruta).
const limiteLogin = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Cuenta por IP + email del cuerpo (si viene) para no castigar IPs compartidas
  // de más, pero sí frenar ataques dirigidos a una cuenta.
  keyGenerator: (req) => {
    const email = req.body && req.body.email ? String(req.body.email).toLowerCase() : '';
    return `${req.ip}|${email}`;
  },
  handler: alSuperarLimite('RATE_LIMIT_LOGIN'),
});

// Limitador para el endpoint de telemetría del agente (Nexus Tracker).
const limiteTracker = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 30, // margen para reintentos; el reporte normal es 1 cada 5 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: alSuperarLimite('RATE_LIMIT_TRACKER'),
});

module.exports = { limiteGeneral, limiteLogin, limiteTracker };
