'use strict';

/**
 * API local del UCG Max (Integrations → API Key en UniFi Network).
 * Lista clientes conectados con MAC, IP y nombre.
 * Base: https://{IP-UCG}/proxy/network/integration/v1
 */

const { env } = require('../config/env');
const https = require('node:https');

function habilitado() {
  return Boolean(env.UNIFI_LOCAL_API_KEY && env.UNIFI_LOCAL_BASE_URL);
}

function headers() {
  return {
    Accept: 'application/json',
    'X-API-KEY': env.UNIFI_LOCAL_API_KEY,
  };
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: headers(),
        rejectUnauthorized: !env.UNIFI_LOCAL_INSECURE_TLS,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout conectando al UCG Max')));
  });
}

async function request(path, query = {}) {
  if (!habilitado()) {
    throw new Error('Configura UNIFI_LOCAL_BASE_URL y UNIFI_LOCAL_API_KEY (Integrations en el UCG Max).');
  }
  const base = env.UNIFI_LOCAL_BASE_URL.replace(/\/$/, '');
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  const { status, body: text } = await httpsGet(url);
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { raw: text };
  }
  if (status < 200 || status >= 300) {
    const msg = body.message || body.error?.message || body.error || text?.slice(0, 120);
    throw new Error(`UniFi local ${status}: ${msg}`);
  }
  return body;
}

async function listarSitiosLocales() {
  const data = await request('/sites');
  return data.data || data.sites || [];
}

async function listarClientes(siteId, opts = {}) {
  let id = siteId || env.UNIFI_LOCAL_SITE_ID;
  if (!id) {
    const sitios = await listarSitiosLocales();
    id = sitios[0]?.id || sitios[0]?.siteId || 'default';
  }
  const data = await request(`/sites/${id}/clients`, { limit: opts.limit || 200 });
  const rows = data.data || data.clients || [];
  return rows.map((c) => ({
    id: c.id,
    mac: c.macAddress || c.mac,
    ip: c.ipAddress || c.ip,
    nombre: c.name || c.displayName || c.hostname,
    tipo: c.type || (c.is_wired ? 'WIRED' : 'WIRELESS'),
    conectadoEn: c.connectedAt || c.last_seen,
  }));
}

module.exports = { habilitado, listarClientes, listarSitiosLocales };
