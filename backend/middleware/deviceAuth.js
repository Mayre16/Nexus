'use strict';

/**
 * deviceAuth.js — Autenticación HMAC para el agente Windows (BadBoy).
 * ---------------------------------------------------------------------
 * El endpoint /api/performance/log NO usa cookies JWT. Valida:
 *   X-Device-Uuid   — UUID del dispositivo registrado en tracker_dispositivos
 *   X-Timestamp     — Unix ms (anti-replay: ±5 min)
 *   X-Signature     — HMAC-SHA256(secreto_dispositivo, timestamp + "." + bodyJson)
 */

const crypto = require('crypto');
const { query } = require('../config/database');
const { descifrar, comparacionSegura } = require('../utils/crypto');
const securityLogger = require('../utils/securityLogger');

const TOLERANCIA_MS = 5 * 60 * 1000; // 5 minutos anti-replay

/**
 * Middleware: valida firma HMAC del agente MonitorSuite/BadBoy.
 */
async function autenticarDispositivo(req, res, next) {
  try {
    const deviceUuid = req.get('X-Device-Uuid');
    const timestamp = req.get('X-Timestamp');
    const signature = req.get('X-Signature');

    if (!deviceUuid || !timestamp || !signature) {
      return res.status(401).json({ error: 'Credenciales de dispositivo ausentes.' });
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TOLERANCIA_MS) {
      await securityLogger.registrar({
        evento: 'TRACKER_REPLAY',
        severidad: 'warning',
        detalle: `timestamp=${timestamp}`,
        req,
      });
      return res.status(401).json({ error: 'Timestamp inválido o expirado.' });
    }

    const filas = await query(
      `SELECT d.id, d.uuid, d.activo, d.api_secret_cifrado, d.usuario_id
         FROM tracker_dispositivos d
        WHERE d.uuid = ? LIMIT 1`,
      [deviceUuid]
    );
    const dispositivo = filas[0];
    if (!dispositivo || dispositivo.activo !== 1) {
      return res.status(401).json({ error: 'Dispositivo no autorizado.' });
    }

    let secreto;
    try {
      secreto = descifrar(dispositivo.api_secret_cifrado);
    } catch (_) {
      return res.status(500).json({ error: 'Error de configuración del dispositivo.' });
    }

    const bodyJson = req.rawBody || JSON.stringify(req.body);
    const payload = `${timestamp}.${bodyJson}`;
    const esperada = crypto.createHmac('sha256', secreto).update(payload).digest('hex');

    if (!comparacionSegura(esperada, signature)) {
      await securityLogger.registrar({
        evento: 'TRACKER_HMAC_FAIL',
        severidad: 'warning',
        usuarioId: dispositivo.usuario_id,
        detalle: `device=${deviceUuid}`,
        req,
      });
      return res.status(401).json({ error: 'Firma inválida.' });
    }

    req.dispositivo = {
      id: dispositivo.id,
      uuid: dispositivo.uuid,
      usuarioId: dispositivo.usuario_id,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { autenticarDispositivo };
