'use strict';

/**
 * Monta módulos externos (addons) en Express.
 * Los módulos nativos Nexus siguen siendo routers en /api/* + HTML estático.
 */

const { env } = require('../config/env');
const { crearProxyApiIerp, crearProxyUiIerp } = require('./ierp/proxy');

/** Debe montarse ANTES de express.json() para que POST/PUT reenvíen el body al upstream. */
function montarProxyApiIerp(app) {
  if (!env.IERP_ENABLED) return;
  console.log(`[MOD] Proxy API iERP → ${env.IERP_API_URL}`);
  app.use(crearProxyApiIerp());
}

function montarModulosExternos(app) {
  if (!env.IERP_ENABLED) {
    console.log('[MOD] iERP deshabilitado (IERP_ENABLED=false)');
    return;
  }

  console.log(`[MOD] Proxy UI iERP → ${env.IERP_UI_URL}`);
  app.use(crearProxyUiIerp());
}

module.exports = { montarProxyApiIerp, montarModulosExternos };
