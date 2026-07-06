'use strict';

const { env } = require('../config/env');

function admHabilitado() {
  return Boolean(env.ADM_API_URL && env.ADM_API_USER && env.ADM_API_PASSWORD);
}

/** Estado del conector ADM (sin llamar al ERP aún). */
function estadoAdm() {
  return {
    habilitado: admHabilitado(),
    url: env.ADM_API_URL || null,
    usuario: env.ADM_API_USER || null,
    modo: admHabilitado() ? 'live' : 'local',
    mensaje: admHabilitado()
      ? 'Credenciales ADM configuradas — sync pendiente de endpoints reales.'
      : 'Sin credenciales ADM — catálogo y pedidos usan BD local Nexus.',
  };
}

/**
 * Push pedido a ADM (stub — devuelve ID simulado hasta conectar API real).
 * @returns {Promise<string|null>}
 */
async function enviarPedidoAdm(pedido) {
  if (!admHabilitado()) return null;
  // TODO: POST real a ADM cuando tengamos spec de API
  return `ADM-${pedido.division === 'deportes' ? 'D' : 'E'}-${pedido.numero}`;
}

/** Sync productos desde ADM (stub — no-op por ahora). */
async function sincronizarProductos(_division) {
  if (!admHabilitado()) {
    return { ok: false, mensaje: 'ADM no configurado.', importados: 0 };
  }
  return { ok: true, mensaje: 'Sync ADM pendiente de implementación.', importados: 0 };
}

module.exports = { admHabilitado, estadoAdm, enviarPedidoAdm, sincronizarProductos };
