'use strict';

/**
 * securityLogger.js — Registro de eventos de seguridad (D11).
 * ---------------------------------------------------------------------
 * Escribe en la tabla `historial_logs_seguridad`. Reglas:
 *   - NUNCA registra contraseñas, tokens ni datos sensibles.
 *   - Nunca interrumpe el flujo principal: si el log falla, se reporta
 *     a consola pero no se propaga el error al request del usuario.
 */

const { query } = require('../config/database');

/**
 * Extrae IP y user-agent de forma segura desde la request.
 * @param {import('express').Request} req
 */
function contextoPeticion(req) {
  // Confiamos en req.ip (configurado con trust proxy en server.js).
  const ip = (req && req.ip ? String(req.ip) : '').slice(0, 45);
  const ua = (req && req.get ? String(req.get('user-agent') || '') : '').slice(0, 255);
  const ruta = (req && req.originalUrl ? String(req.originalUrl) : '').slice(0, 255);
  return { ip, ua, ruta };
}

/**
 * Registra un evento de seguridad.
 * @param {Object} datos
 * @param {string} datos.evento        - Código corto (LOGIN_OK, LOGIN_FAIL, ...)
 * @param {('info'|'warning'|'critical')} [datos.severidad]
 * @param {boolean} [datos.exito]
 * @param {number|null} [datos.usuarioId]
 * @param {string|null} [datos.emailIntento]
 * @param {string|null} [datos.detalle]
 * @param {import('express').Request|null} [datos.req]
 */
async function registrar({
  evento,
  severidad = 'info',
  exito = false,
  usuarioId = null,
  emailIntento = null,
  detalle = null,
  req = null,
}) {
  try {
    const { ip, ua, ruta } = contextoPeticion(req);
    await query(
      `INSERT INTO historial_logs_seguridad
        (usuario_id, email_intento, evento, severidad, exito, ip, user_agent, ruta, detalle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioId,
        emailIntento ? String(emailIntento).slice(0, 180) : null,
        String(evento).slice(0, 80),
        severidad,
        exito ? 1 : 0,
        ip || null,
        ua || null,
        ruta || null,
        detalle ? String(detalle).slice(0, 2000) : null,
      ]
    );
  } catch (err) {
    // No romper el flujo por un fallo de auditoría; sí dejar rastro en consola.
    console.error('[securityLogger] No se pudo registrar el evento:', err.message);
  }
}

module.exports = { registrar };
