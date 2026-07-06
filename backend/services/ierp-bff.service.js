'use strict';

const { env } = require('../config/env');

let tokenCache = { accessToken: null, refreshToken: null, expiresAt: 0 };

function baseUrl() {
  return (env.IERP_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
}

async function loginIerp() {
  const email = env.IERP_BFF_EMAIL || process.env.IERP_BFF_EMAIL;
  const password = env.IERP_BFF_PASSWORD || process.env.IERP_BFF_PASSWORD;
  if (!email || !password) {
    const err = new Error(
      'Configure IERP_BFF_EMAIL e IERP_BFF_PASSWORD en config/.env (usuario iERP de servicio).',
    );
    err.code = 'IERP_BFF_CREDENTIALS';
    throw err;
  }

  const res = await fetch(`${baseUrl()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Login iERP falló (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const access = data.accessToken;
  const refresh = data.refreshToken;
  if (!access) throw new Error('Respuesta login iERP sin accessToken');
  tokenCache = {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: Date.now() + 14 * 60 * 1000,
  };
  return access;
}

async function obtenerToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  return loginIerp();
}

async function ierpFetch(path, { method = 'GET', query, body } = {}) {
  const token = await obtenerToken();
  const url = new URL(`${baseUrl()}/api${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    tokenCache.expiresAt = 0;
    const token2 = await obtenerToken();
    const res2 = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res2.ok) {
      const t = await res2.text();
      throw new Error(`iERP ${path} → ${res2.status}: ${t.slice(0, 300)}`);
    }
    if (res2.status === 204) return null;
    return res2.json();
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`iERP ${path} → ${res.status}: ${t.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function estado() {
  try {
    await obtenerToken();
    const stats = await ierpFetch('/dashboard/stats');
    return { conectado: true, stats };
  } catch (e) {
    return { conectado: false, error: e.message, code: e.code };
  }
}

async function listarCotizaciones(query = {}) {
  return ierpFetch('/sales/orders', { query: { ...query, status: 'QUOTE', limit: 50 } });
}

async function obtenerCotizacion(id) {
  return ierpFetch(`/sales/orders/${id}`);
}

async function listarFacturas(query = {}) {
  return ierpFetch('/accounting/invoices', { query: { ...query, limit: 50 } });
}

async function obtenerFactura(id) {
  return ierpFetch(`/accounting/invoices/${id}`);
}

async function listarClientes(query = {}) {
  return ierpFetch('/crm/companies', { query: { ...query, limit: 50 } });
}

async function obtenerCliente(id) {
  return ierpFetch(`/crm/companies/${id}`);
}

async function listarProductos(query = {}) {
  return ierpFetch('/inventory/products', { query: { ...query, limit: 50 } });
}

async function obtenerProducto(id) {
  return ierpFetch(`/inventory/products/${id}`);
}

async function resumenDashboard() {
  return ierpFetch('/dashboard/stats');
}

module.exports = {
  estado,
  resumenDashboard,
  listarCotizaciones,
  obtenerCotizacion,
  listarFacturas,
  obtenerFactura,
  listarClientes,
  obtenerCliente,
  listarProductos,
  obtenerProducto,
};
