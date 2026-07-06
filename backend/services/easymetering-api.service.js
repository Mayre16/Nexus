'use strict';

/**
 * Cliente API Energify (EasyMetering AMI Cloud) — sin navegador.
 * Usa JWT refresh/access contra /api/v2 y endpoints legacy JSON.
 */
const { env } = require('../config/env');

const BASE = (env.EASYMETERING_BASE_URL || 'https://adesa.cloud.easymetering.com').replace(/\/$/, '');
const API_V2 = `${BASE}/api/v2`;
const API_LEGACY = `${BASE}/api`;

let accessCache = env.EASYMETERING_ACCESS_TOKEN || null;

async function httpJson(url, { method = 'GET', body, token } = {}) {
  const headers = {
    Accept: 'application/json',
    'Accept-Language': 'es',
  };
  const bearer = token || accessCache;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.detail || data?.error || text?.slice(0, 200) || res.statusText;
    throw Object.assign(new Error(`Energify ${res.status}: ${msg}`), { status: res.status, data });
  }
  if (text && !data && text.trim().startsWith('<')) {
    throw Object.assign(new Error('Energify devolvió HTML en lugar de JSON'), { status: 502 });
  }
  return data;
}

async function refreshAccess() {
  const refresh = env.EASYMETERING_REFRESH_TOKEN;
  if (!refresh) {
    throw Object.assign(new Error('Configure EASYMETERING_REFRESH_TOKEN (ejecute: node scripts/capture-energify-token.js)'), { status: 400 });
  }
  const data = await httpJson(`${API_V2}/auth/token/refresh/`, {
    method: 'POST',
    body: { refresh },
    token: null,
  });
  accessCache = data.access || data.access_token;
  if (!accessCache) throw new Error('Refresh sin access token');
  return accessCache;
}

async function ensureAccess() {
  if (accessCache) {
    try {
      await httpJson(`${API_V2}/account/get_data_user/`);
      return accessCache;
    } catch {
      accessCache = null;
    }
  }
  return refreshAccess();
}

async function globalSearch(query) {
  await ensureAccess();
  const q = encodeURIComponent(query);
  return httpJson(`${API_LEGACY}/globalsearch/?value=${q}`);
}

/** Intenta listar medidores vía API (datatable / listados v2). */
async function tryListEndpoints() {
  await ensureAccess();
  const candidates = [
    ['GET', `${API_LEGACY}/meters/active/list/`],
    ['GET', `${API_LEGACY}/meters/active/data/`],
    ['POST', `${API_LEGACY}/meters/active/datatable/`, { draw: 1, start: 0, length: 500 }],
    ['GET', `${API_V2}/meters/`],
    ['GET', `${API_V2}/meters/active/`],
    ['GET', `${API_V2}/meter/active/`],
  ];
  for (const [method, url, body] of candidates) {
    try {
      const data = await httpJson(url, { method, body });
      const items = flattenItems(data);
      if (items.length) return items;
    } catch {
      /* siguiente */
    }
  }
  return [];
}

function flattenItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === 'object');
  for (const key of ['results', 'data', 'rows', 'items', 'serial', 'meters', 'aaData']) {
    if (Array.isArray(data[key]) && data[key].length) {
      return data[key].filter((x) => x && typeof x === 'object');
    }
  }
  return [];
}

function mapEstado(raw) {
  const t = String(raw || '').toLowerCase();
  if (t.includes('online') || t.includes('línea') || t.includes('linea') || t.includes('activo')) return 'online';
  if (t.includes('advertencia') || t.includes('warning') || t.includes('aviso')) return 'advertencia_offline';
  if (t.includes('offline') || t.includes('fuera') || t.includes('inactivo')) return 'offline';
  return 'desconocido';
}

const { normalizarImportEquipo } = require('./grid-import.service');

function mapEquipo(item) {
  const serial = item.serial || item.serial_number || item.meter_id || item.medidor;
  const id = String(item.id || item.meter_id || serial || '');
  if (!id) return null;
  const norm = normalizarImportEquipo({
    external_id: id,
    serial: String(serial || id),
    nombre: item.name || item.nombre || item.customer_name || item.descripcion || String(serial || id),
    estado: mapEstado(item.status || item.estado || item.estatus || item.connection),
    kwh_dia: item.kwh_dia ?? item.daily_kwh ?? null,
    plataforma: 'adesa_cloud',
    metadata: { fuente: 'api', raw: item },
  });
  return {
    ...norm,
    fecha_lectura: new Date().toISOString().slice(0, 10),
  };
}

/** Búsqueda por prefijos (globalsearch exige ≥3 caracteres). */
async function fetchViaGlobalSearch() {
  const prefixes = ['205', '929', '199', '338', '193', '352', '234', '100', '891', '102'];
  const seen = new Map();
  for (const p of prefixes) {
    try {
      const data = await globalSearch(p);
      const list = data?.serial || [];
      for (const item of list) {
        const eq = mapEquipo(item);
        if (eq) seen.set(eq.external_id, eq);
      }
    } catch {
      /* ignore */
    }
  }
  return [...seen.values()];
}

async function fetchEquipos() {
  let items = await tryListEndpoints();
  if (!items.length) {
    return fetchViaGlobalSearch();
  }
  return items.map(mapEquipo).filter(Boolean);
}

async function estadoApi() {
  const tieneRefresh = Boolean(env.EASYMETERING_REFRESH_TOKEN);
  const tieneAccess = Boolean(env.EASYMETERING_ACCESS_TOKEN);
  return {
    disponible: tieneRefresh || tieneAccess,
    modo: 'api',
    mensaje: tieneRefresh
      ? 'API JWT (sin navegador)'
      : (tieneAccess ? 'Access token directo' : 'Falta EASYMETERING_REFRESH_TOKEN'),
  };
}

module.exports = {
  ensureAccess,
  refreshAccess,
  fetchEquipos,
  globalSearch,
  estadoApi,
};
