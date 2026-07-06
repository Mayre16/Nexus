'use strict';

/**
 * Cliente Ubiquiti Site Manager API (cloud — api.ui.com/v1).
 * Cubre hosts, sitios, dispositivos UniFi y conteos de clientes.
 * La lista detallada por MAC requiere además la API local del UCG (unifiNetworkLocal.js).
 * Docs: https://developer.ui.com/site-manager-api/
 */

const { env } = require('../config/env');

function headers() {
  if (!env.UNIFI_SITE_MANAGER_API_KEY) {
    throw new Error('UNIFI_SITE_MANAGER_API_KEY no configurada en config/.env');
  }
  return {
    Accept: 'application/json',
    'X-API-KEY': env.UNIFI_SITE_MANAGER_API_KEY,
  };
}

async function request(path, query = {}) {
  const base = env.UNIFI_SITE_MANAGER_BASE_URL.replace(/\/$/, '');
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  const res = await fetch(url, { headers: headers() });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body.message || body.error || body.meta?.msg || res.statusText;
    throw new Error(`UniFi Site Manager ${res.status}: ${msg}`);
  }
  return body;
}

function normalizarSitio(row) {
  const stats = row.statistics?.counts || {};
  return {
    id: row.siteId || row.id,
    hostId: row.hostId,
    nombre: row.meta?.name || row.name || 'default',
    descripcion: row.meta?.desc || row.description || '',
    gatewayMac: row.meta?.gatewayMac,
    timezone: row.meta?.timezone,
    clientesWifi: stats.wifiClient ?? null,
    clientesCable: stats.wiredClient ?? null,
    dispositivos: stats.totalDevice ?? null,
    gateway: row.statistics?.gateway?.shortname || null,
  };
}

async function listarSitios() {
  const data = await request('/sites', { limit: 100 });
  const rows = data.data || data.sites || [];
  return rows.map(normalizarSitio);
}

async function resolverSiteId(siteId) {
  if (siteId || env.UNIFI_SITE_ID) return siteId || env.UNIFI_SITE_ID;
  const sitios = await listarSitios();
  if (!sitios.length) throw new Error('No hay sitios UniFi en esta cuenta.');
  return sitios[0].id;
}

async function listarHosts() {
  const data = await request('/hosts', { limit: 50 });
  const rows = data.data || data.hosts || [];
  return rows.map((h) => ({
    id: h.id,
    tipo: h.type,
    ip: h.ipAddress,
    hardwareId: h.hardwareId,
    online: h.lastConnectionStateChange,
    email: h.userData?.email,
    consola: h.userData?.controllers?.includes('network'),
  }));
}

/** APs, switches y gateway (no son los celulares/PCs de usuarios). */
async function listarDispositivosRed() {
  const data = await request('/devices', { limit: 100 });
  const grupos = data.data || [];
  const out = [];
  for (const g of grupos) {
    for (const d of g.devices || []) {
      out.push({
        hostName: g.hostName,
        hostId: g.hostId,
        id: d.id,
        mac: d.mac,
        nombre: d.name,
        modelo: d.model || d.shortname,
        ip: d.ip,
        estado: d.status,
        firmware: d.version,
        esConsola: d.isConsole,
      });
    }
  }
  return out;
}

/** Resumen del sitio ADESA (conteos; no MAC individual). */
async function resumenSitio(siteId) {
  const id = await resolverSiteId(siteId);
  const sitios = await listarSitios();
  const sitio = sitios.find((s) => s.id === id) || sitios[0];
  if (!sitio) throw new Error('Sitio no encontrado.');
  return sitio;
}

function normalizarCliente(c) {
  return {
    id: c.id,
    mac: c.macAddress || c.mac,
    ip: c.ipAddress || c.ip,
    nombre: c.name || c.displayName || c.hostname,
    tipo: c.type || (c.is_wired ? 'WIRED' : 'WIRELESS'),
    conectadoEn: c.connectedAt || c.last_seen,
  };
}

async function resolverConsoleId() {
  if (env.UNIFI_CONSOLE_ID) return env.UNIFI_CONSOLE_ID;
  const hosts = await listarHosts();
  if (!hosts.length) throw new Error('No hay consolas UniFi en Site Manager.');
  return hosts[0].id;
}

/** UUID del sitio Network (distinto del siteId de Site Manager /sites). */
async function resolverNetworkSiteId(consoleId, siteId) {
  if (env.UNIFI_NETWORK_SITE_ID) return env.UNIFI_NETWORK_SITE_ID;

  const path = `/connector/consoles/${encodeURIComponent(consoleId)}/proxy/network/integration/v1/sites`;
  const data = await request(path, { limit: 25 });
  const rows = data.data || [];
  if (!rows.length) throw new Error('No hay sitios Network en la consola UniFi.');

  const preferido = siteId || env.UNIFI_SITE_ID;
  if (preferido) {
    const match = rows.find(
      (s) => s.id === preferido || s.internalReference === preferido || s.name === preferido
    );
    if (match) return match.id;
  }

  const sitiosSm = await listarSitios();
  const sm = sitiosSm[0];
  if (sm) {
    const match = rows.find(
      (s) =>
        (sm.gatewayMac && s.meta?.gatewayMac === sm.gatewayMac)
        || s.internalReference === sm.nombre
        || s.name === sm.nombre
    );
    if (match) return match.id;
  }

  return rows[0].id;
}

/**
 * Clientes con MAC vía proxy cloud (NO requiere login en 10.0.0.163).
 * Requiere Site Manager API key + UNIFI_CONSOLE_ID + firmware UCG >= 5.0.3.
 */
async function listarClientesViaProxy(siteId, opts = {}) {
  const consoleId = await resolverConsoleId();
  const smSiteId = await resolverSiteId(siteId);
  const networkSiteId = await resolverNetworkSiteId(consoleId, smSiteId);
  const path =
    `/connector/consoles/${encodeURIComponent(consoleId)}/proxy/network/integration/v1/sites/${networkSiteId}/clients`;
  const data = await request(path, { limit: opts.limit || 200 });
  const rows = data.data || data.clients || [];
  return { siteId: networkSiteId, consoleId, clientes: rows.map(normalizarCliente) };
}

module.exports = {
  listarSitios,
  listarHosts,
  listarDispositivosRed,
  resumenSitio,
  resolverSiteId,
  listarClientesViaProxy,
};
