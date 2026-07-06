'use strict';

/**
 * rawBody.js — Captura el cuerpo HTTP en bruto antes de express.json().
 * Necesario para verificar HMAC del agente BadBoy: la firma se calcula
 * sobre el JSON exacto enviado, no sobre JSON.stringify(req.body).
 */

function capturarRawBody(req, res, buf) {
  if (buf && buf.length) {
    req.rawBody = buf.toString('utf8');
  }
}

module.exports = { capturarRawBody };
