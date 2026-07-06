'use strict';

/**
 * env.js — Carga y validación centralizada de variables de entorno.
 * ---------------------------------------------------------------------
 * Regla Innegociable #4: ningún secreto en el código. Todo viene de .env.
 * Este módulo:
 *   1) Carga el .env (desde /config/.env o la raíz del backend).
 *   2) Valida que los secretos CRÍTICOS existan antes de arrancar
 *      (fail-fast: preferimos no levantar el server que correr inseguro).
 *   3) Expone un objeto `env` tipado y de solo lectura.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Busca el .env primero en /config/.env y luego en la raíz del backend.
const candidatos = [
  path.resolve(__dirname, '../../config/.env'),
  path.resolve(__dirname, '../.env'),
];
const rutaEnv = candidatos.find((p) => fs.existsSync(p));
if (rutaEnv) {
  dotenv.config({ path: rutaEnv });
} else {
  dotenv.config(); // intenta variables ya presentes en el entorno (cPanel/PM2)
}

/**
 * Obtiene una variable obligatoria; lanza si falta (fail-fast).
 * @param {string} clave
 * @returns {string}
 */
function requerido(clave) {
  const valor = process.env[clave];
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new Error(
      `[CONFIG] Falta la variable de entorno obligatoria: ${clave}. ` +
        `Revisa config/.env (usa config/.env.example como guía).`
    );
  }
  return String(valor).trim();
}

/**
 * Obtiene una variable opcional con valor por defecto.
 * @param {string} clave
 * @param {string} [porDefecto]
 * @returns {string|undefined}
 */
function opcional(clave, porDefecto) {
  const valor = process.env[clave];
  return valor === undefined || String(valor).trim() === ''
    ? porDefecto
    : String(valor).trim();
}

const NODE_ENV = opcional('NODE_ENV', 'development');
const esProduccion = NODE_ENV === 'production';

// --- Validaciones de longitud mínima de secretos (defensa básica) ---
function validarLongitud(clave, valor, minBytesHex) {
  // En hex, cada byte = 2 chars. Validamos que el secreto tenga fuerza suficiente.
  if (valor.length < minBytesHex) {
    throw new Error(
      `[CONFIG] ${clave} es demasiado corto (${valor.length} chars). ` +
        `Genera uno fuerte con: npm run gen:secret / npm run gen:enckey`
    );
  }
}

const JWT_ACCESS_SECRET = requerido('JWT_ACCESS_SECRET');
const JWT_REFRESH_SECRET = requerido('JWT_REFRESH_SECRET');
const DATA_ENCRYPTION_KEY = requerido('DATA_ENCRYPTION_KEY');

validarLongitud('JWT_ACCESS_SECRET', JWT_ACCESS_SECRET, 32);
validarLongitud('JWT_REFRESH_SECRET', JWT_REFRESH_SECRET, 32);
// La clave AES-256 debe ser exactamente 32 bytes => 64 chars hex.
if (!/^[0-9a-fA-F]{64}$/.test(DATA_ENCRYPTION_KEY)) {
  throw new Error(
    '[CONFIG] DATA_ENCRYPTION_KEY debe ser 32 bytes en HEX (64 caracteres). ' +
      'Genera con: npm run gen:enckey'
  );
}
if (JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
  throw new Error('[CONFIG] JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser DISTINTOS.');
}

const env = Object.freeze({
  NODE_ENV,
  esProduccion,
  APP_NAME: opcional('APP_NAME', 'ADESA Nexus'),
  PORT: parseInt(opcional('PORT', '3000'), 10),

  // CORS: allowlist explícita (nunca "*")
  CORS_ALLOWED_ORIGINS: opcional('CORS_ALLOWED_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  COOKIE_DOMAIN: opcional('COOKIE_DOMAIN'),

  // Base de datos
  DB_HOST: requerido('DB_HOST'),
  DB_PORT: parseInt(opcional('DB_PORT', '3306'), 10),
  DB_NAME: requerido('DB_NAME'),
  DB_USER: requerido('DB_USER'),
  DB_PASSWORD: opcional('DB_PASSWORD', ''),
  DB_CONNECTION_LIMIT: parseInt(opcional('DB_CONNECTION_LIMIT', '10'), 10),

  // JWT
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_TTL: opcional('JWT_ACCESS_TTL', '15m'),
  JWT_REFRESH_TTL: opcional('JWT_REFRESH_TTL', '7d'),
  JWT_ISSUER: opcional('JWT_ISSUER', 'adesa-nexus'),
  JWT_AUDIENCE: opcional('JWT_AUDIENCE', 'adesa-nexus-clients'),

  // Cifrado en reposo
  DATA_ENCRYPTION_KEY,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(opcional('RATE_LIMIT_WINDOW_MS', '900000'), 10),
  RATE_LIMIT_MAX: parseInt(opcional('RATE_LIMIT_MAX', '300'), 10),
  LOGIN_RATE_LIMIT_MAX: parseInt(opcional('LOGIN_RATE_LIMIT_MAX', '5'), 10),

  // Uploads
  UPLOAD_DIR: opcional('UPLOAD_DIR', './storage/uploads'),
  UPLOAD_MAX_BYTES: parseInt(opcional('UPLOAD_MAX_BYTES', '10485760'), 10),

  // Tracker (app badboy)
  TRACKER_DEVICE_SHARED_SECRET: opcional('TRACKER_DEVICE_SHARED_SECRET'),

  // Nexus Desk — buzones por división
  DESK_MAIL_ENERGIA: opcional('DESK_MAIL_ENERGIA', 'soporte@adesa.com.do'),
  DESK_MAIL_DEPORTES: opcional('DESK_MAIL_DEPORTES'),
  DESK_IMAP_ENABLED: opcional('DESK_IMAP_ENABLED', 'false') === 'true',
  DESK_IMAP_POLL_MINUTES: parseInt(opcional('DESK_IMAP_POLL_MINUTES', '3'), 10),
  IMAP_HOST: opcional('IMAP_HOST'),
  IMAP_PORT: parseInt(opcional('IMAP_PORT', '993'), 10),
  IMAP_TLS: opcional('IMAP_TLS', 'true') === 'true',
  IMAP_ENERGIA_USER: opcional('IMAP_ENERGIA_USER', opcional('DESK_MAIL_ENERGIA', 'soporte@adesa.com.do')),
  IMAP_ENERGIA_PASSWORD: opcional('IMAP_ENERGIA_PASSWORD', opcional('IMAP_PASSWORD')),
  IMAP_DEPORTES_USER: opcional('IMAP_DEPORTES_USER', opcional('DESK_MAIL_DEPORTES')),
  IMAP_DEPORTES_PASSWORD: opcional('IMAP_DEPORTES_PASSWORD'),
  IMAP_DEPORTES_HOST: opcional('IMAP_DEPORTES_HOST', 'mail.labicicleteria.do'),
  SMTP_HOST: opcional('SMTP_HOST'),
  SMTP_PORT: parseInt(opcional('SMTP_PORT', '465'), 10),
  SMTP_SECURE: opcional('SMTP_SECURE', 'true') === 'true',
  SMTP_ENERGIA_USER: opcional('SMTP_ENERGIA_USER', opcional('DESK_MAIL_ENERGIA', 'soporte@adesa.com.do')),
  SMTP_ENERGIA_PASSWORD: opcional('SMTP_ENERGIA_PASSWORD', opcional('SMTP_PASSWORD')),
  SMTP_DEPORTES_USER: opcional('SMTP_DEPORTES_USER', opcional('DESK_MAIL_DEPORTES')),
  SMTP_DEPORTES_PASSWORD: opcional('SMTP_DEPORTES_PASSWORD'),
  SMTP_DEPORTES_HOST: opcional('SMTP_DEPORTES_HOST', 'mail.labicicleteria.do'),

  // UniFi Site Manager (clientes conectados por MAC)
  UNIFI_SITE_MANAGER_ENABLED: opcional('UNIFI_SITE_MANAGER_ENABLED', 'false') === 'true',
  UNIFI_SITE_MANAGER_BASE_URL: opcional('UNIFI_SITE_MANAGER_BASE_URL', 'https://api.ui.com/v1'),
  UNIFI_SITE_MANAGER_API_KEY: opcional('UNIFI_SITE_MANAGER_API_KEY'),
  UNIFI_SITE_ID: opcional('UNIFI_SITE_ID'),
  /** ID de la consola ADESA (URL unifi.ui.com/consoles/{este-id}/...) */
  UNIFI_CONSOLE_ID: opcional('UNIFI_CONSOLE_ID'),

  // UniFi Network local (UCG Max — clientes por MAC)
  UNIFI_LOCAL_BASE_URL: opcional('UNIFI_LOCAL_BASE_URL'),
  UNIFI_LOCAL_API_KEY: opcional('UNIFI_LOCAL_API_KEY'),
  UNIFI_LOCAL_SITE_ID: opcional('UNIFI_LOCAL_SITE_ID'),
  /** Certificado autofirmado del UCG Max (normal en LAN). */
  UNIFI_LOCAL_INSECURE_TLS: opcional('UNIFI_LOCAL_INSECURE_TLS', 'true') === 'true',

  // ERP ADM (Nexus Store / Office)
  ADM_API_URL: opcional('ADM_API_URL'),
  ADM_API_USER: opcional('ADM_API_USER'),
  ADM_API_PASSWORD: opcional('ADM_API_PASSWORD'),

  // Módulo iERP (addon estilo Odoo — proxy a NestJS + Next.js)
  IERP_ENABLED: opcional('IERP_ENABLED', 'true') === 'true',
  IERP_API_URL: opcional('IERP_API_URL', 'http://127.0.0.1:3001'),
  IERP_UI_URL: opcional('IERP_UI_URL', 'http://127.0.0.1:3002'),
  /** Lista separada por comas de technicalName a ocultar (ej: hub,grid) */
  MODULES_DISABLED: opcional('MODULES_DISABLED', ''),

  /** API key compartida iERP → Nexus Leads (integración módulos) */
  IERP_NEXUS_API_KEY: opcional('IERP_NEXUS_API_KEY', ''),
  /** Usuario iERP de servicio para la UI nativa Nexus (/api/ierp-nexus) */
  IERP_BFF_EMAIL: opcional('IERP_BFF_EMAIL', ''),
  IERP_BFF_PASSWORD: opcional('IERP_BFF_PASSWORD', ''),
  /** URL pública de Nexus (enlaces deep-link a iERP) */
  NEXUS_PUBLIC_URL: opcional('NEXUS_PUBLIC_URL', 'http://localhost:3000'),

  /** Intérprete Python para workers (Power Quality, ScrapiBids, Grid) */
  PYTHON_BIN: opcional('PYTHON_BIN', 'python'),

  /** EasyMetering Energify AMI Cloud — Nexus Grid */
  EASYMETERING_BASE_URL: opcional('EASYMETERING_BASE_URL', 'https://adesa.cloud.easymetering.com'),
  EASYMETERING_LOGIN_URL: opcional('EASYMETERING_LOGIN_URL', 'https://adesa.cloud.easymetering.com/login?next=/'),
  EASYMETERING_USER: opcional('EASYMETERING_USER', ''),
  EASYMETERING_PASSWORD: opcional('EASYMETERING_PASSWORD', ''),
  EASYMETERING_ACCESS_TOKEN: opcional('EASYMETERING_ACCESS_TOKEN', ''),
  EASYMETERING_REFRESH_TOKEN: opcional('EASYMETERING_REFRESH_TOKEN', ''),
  EASYMETERING_RECAPTCHA_TOKEN: opcional('EASYMETERING_RECAPTCHA_TOKEN', ''),
  /** auto | api | browser — cómo sincronizar Grid con Energify */
  EASYMETERING_SYNC_MODE: opcional('EASYMETERING_SYNC_MODE', 'auto'),

  /** Accuenergy AcuRev 2100 — API token (integración pendiente) */
  ACUREV2100_API_TOKEN: opcional('ACUREV2100_API_TOKEN', ''),

  // Modo previsualización local: permite arrancar SIN MySQL.
  // Se ignora por completo en producción (nunca debe usarse en prod).
  ALLOW_NO_DB: !esProduccion && opcional('ALLOW_NO_DB', 'false') === 'true',
});

module.exports = { env, requerido, opcional };
