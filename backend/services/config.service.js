'use strict';

const repo = require('../repositories/config.repository');
const { env } = require('../config/env');
const { cifrar, descifrar } = require('../utils/crypto');

const CLAVES = {
  SMTP_ENERGIA: 'smtp.energia',
  SMTP_DEPORTES: 'smtp.deportes',
  NOTIF_TICKETS: 'notifications.tickets',
  NOTIF_LEADS: 'notifications.leads',
  INTEGR_IERP: 'integrations.ierp',
  INTEGR_ADM: 'integrations.adm',
  INTEGR_IMAP: 'integrations.imap',
  GENERAL: 'general.app',
};

function enmascararSecreto(val) {
  if (!val) return '';
  return '********';
}

function parseJson(row) {
  if (!row) return null;
  const v = row.valor_json;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function cifrarCampo(valor) {
  if (!valor || valor === '********') return null;
  const buf = cifrar(valor);
  return buf ? buf.toString('base64') : null;
}

function descifrarCampo(enc) {
  if (!enc) return null;
  try {
    return descifrar(Buffer.from(enc, 'base64'));
  } catch {
    return null;
  }
}

function smtpDesdeEnv(division) {
  const esDeportes = division === 'deportes';
  return {
    enabled: Boolean(env.SMTP_HOST || env.SMTP_DEPORTES_HOST),
    host: esDeportes ? env.SMTP_DEPORTES_HOST || env.SMTP_HOST : env.SMTP_HOST,
    port: env.SMTP_PORT || 465,
    secure: env.SMTP_SECURE !== false,
    user: esDeportes ? env.SMTP_DEPORTES_USER : env.SMTP_ENERGIA_USER,
    password: esDeportes ? env.SMTP_DEPORTES_PASSWORD : env.SMTP_ENERGIA_PASSWORD,
    from: esDeportes ? env.SMTP_DEPORTES_USER || env.DESK_MAIL_DEPORTES : env.SMTP_ENERGIA_USER || env.DESK_MAIL_ENERGIA,
    source: 'env',
  };
}

async function getRaw(clave) {
  const row = await repo.obtener(clave);
  return parseJson(row);
}

async function getSmtpEffective(division) {
  const clave = division === 'deportes' ? CLAVES.SMTP_DEPORTES : CLAVES.SMTP_ENERGIA;
  const db = await getRaw(clave);
  const fallback = smtpDesdeEnv(division);

  if (!db) return fallback;

  const password = db.password_enc ? descifrarCampo(db.password_enc) : fallback.password;
  return {
    enabled: db.enabled !== false,
    host: db.host || fallback.host,
    port: db.port || fallback.port,
    secure: db.secure !== undefined ? db.secure : fallback.secure,
    user: db.user || fallback.user,
    password: password || fallback.password,
    from: db.from || db.user || fallback.from,
    source: db.host || db.user ? 'db' : 'env',
  };
}

async function getNotifications() {
  const tickets = (await getRaw(CLAVES.NOTIF_TICKETS)) || {
    enabled: true,
    on_create: true,
    on_assign: true,
  };
  const leads = (await getRaw(CLAVES.NOTIF_LEADS)) || {
    enabled: true,
    on_ot: true,
    on_ticket: true,
  };
  return { tickets, leads };
}

async function getIntegrationsStatus() {
  const ierpDb = await getRaw(CLAVES.INTEGR_IERP);
  const admDb = await getRaw(CLAVES.INTEGR_ADM);
  const imapDb = await getRaw(CLAVES.INTEGR_IMAP);

  return {
    ierp: {
      enabled: ierpDb?.enabled !== false && env.IERP_ENABLED,
      api_url: env.IERP_API_URL,
      ui_url: env.IERP_UI_URL,
      leads_key_configured: Boolean(env.IERP_NEXUS_API_KEY),
      source: 'env',
    },
    adm: {
      enabled: admDb?.enabled !== false && Boolean(env.ADM_API_URL && env.ADM_API_USER),
      url: env.ADM_API_URL || null,
      configured: Boolean(env.ADM_API_URL && env.ADM_API_USER && env.ADM_API_PASSWORD),
    },
    imap: {
      enabled: imapDb?.enabled !== false && env.DESK_IMAP_ENABLED,
      poll_minutes: env.DESK_IMAP_POLL_MINUTES,
    },
    modules_disabled: env.MODULES_DISABLED || '',
  };
}

async function listarParaAdmin() {
  const rows = await repo.listar();
  const map = {};
  for (const r of rows) {
    const val = parseJson(r);
    if (r.secreto && val?.password_enc) {
      map[r.clave] = { ...val, password: enmascararSecreto('x'), password_enc: undefined };
    } else {
      map[r.clave] = val;
    }
  }

  const energia = await getSmtpEffective('energia');
  const deportes = await getSmtpEffective('deportes');

  return {
    config: map,
    smtp_status: {
      energia: {
        configured: Boolean(energia.host && energia.user && energia.password),
        enabled: energia.enabled,
        host: energia.host,
        from: energia.from,
        source: energia.source,
      },
      deportes: {
        configured: Boolean(deportes.host && deportes.user && deportes.password),
        enabled: deportes.enabled,
        host: deportes.host,
        from: deportes.from,
        source: deportes.source,
      },
    },
    integrations: await getIntegrationsStatus(),
    notifications: await getNotifications(),
    env_fallback: {
      note: 'Valores en .env siguen activos como respaldo si no hay override en BD.',
    },
  };
}

async function guardarSmtp(division, body, usuarioId) {
  const clave = division === 'deportes' ? CLAVES.SMTP_DEPORTES : CLAVES.SMTP_ENERGIA;
  const prev = (await getRaw(clave)) || {};
  const payload = {
    enabled: body.enabled !== false,
    host: body.host || prev.host || '',
    port: parseInt(body.port, 10) || prev.port || 465,
    secure: body.secure !== false,
    user: body.user || prev.user || '',
    from: body.from || body.user || prev.from || '',
  };
  if (body.password && body.password !== '********') {
    payload.password_enc = cifrarCampo(body.password);
  } else if (prev.password_enc) {
    payload.password_enc = prev.password_enc;
  }
  await repo.guardar(clave, payload, 'smtp', true, usuarioId);
  return getSmtpEffective(division);
}

async function guardarNotificaciones(seccion, body, usuarioId) {
  const clave = seccion === 'leads' ? CLAVES.NOTIF_LEADS : CLAVES.NOTIF_TICKETS;
  await repo.guardar(clave, body, 'notifications', false, usuarioId);
  return getNotifications();
}

async function guardarIntegracion(nombre, body, usuarioId) {
  const map = { ierp: CLAVES.INTEGR_IERP, adm: CLAVES.INTEGR_ADM, imap: CLAVES.INTEGR_IMAP };
  const clave = map[nombre];
  if (!clave) throw new Error('Integración desconocida.');
  await repo.guardar(clave, { enabled: body.enabled !== false }, 'integrations', false, usuarioId);
  return getIntegrationsStatus();
}

async function guardarGeneral(body, usuarioId) {
  await repo.guardar(
    CLAVES.GENERAL,
    {
      app_name: body.app_name || env.APP_NAME,
      public_url: body.public_url || env.NEXUS_PUBLIC_URL,
    },
    'general',
    false,
    usuarioId,
  );
  return getRaw(CLAVES.GENERAL);
}

module.exports = {
  CLAVES,
  getRaw,
  getSmtpEffective,
  getNotifications,
  getIntegrationsStatus,
  listarParaAdmin,
  guardarSmtp,
  guardarNotificaciones,
  guardarIntegracion,
  guardarGeneral,
  enmascararSecreto,
};
