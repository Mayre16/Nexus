'use strict';

/**
 * errorHandler.js — Manejo centralizado de errores y 404 (D7 + D11).
 * ---------------------------------------------------------------------
 * - En producción NUNCA devolvemos stack traces ni mensajes internos
 *   (evita fuga de información). El detalle se registra en el servidor.
 * - En desarrollo sí mostramos el detalle para depurar.
 */

const { env } = require('../config/env');

/** Middleware 404 para rutas no encontradas. */
function noEncontrado(req, res, _next) {
  res.status(404).json({ error: 'Recurso no encontrado.' });
}

/** Middleware de error final (4 argumentos: Express lo reconoce como handler). */
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, _next) {
  // Log interno completo (solo servidor).
  console.error('[ERROR]', err.message, env.esProduccion ? '' : err.stack || '');

  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;

  const cuerpo = { error: 'Ocurrió un error procesando la solicitud.' };
  if (!env.esProduccion) {
    // Solo en dev: detalle para depurar.
    cuerpo.detalle = err.message;
  }
  res.status(status).json(cuerpo);
}

module.exports = { noEncontrado, manejadorErrores };
