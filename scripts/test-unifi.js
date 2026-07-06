'use strict';

/**
 * Prueba UniFi: Site Manager (cloud) — no requiere login local en 10.0.0.163
 */

require('../backend/config/env');
const siteManager = require('../backend/services/unifiSiteManager');
const local = require('../backend/services/unifiNetworkLocal');
const { env } = require('../backend/config/env');

async function main() {
  if (!env.UNIFI_SITE_MANAGER_ENABLED || !env.UNIFI_SITE_MANAGER_API_KEY) {
    console.log('Configura UNIFI_SITE_MANAGER_ENABLED=true y UNIFI_SITE_MANAGER_API_KEY en config/.env');
    process.exit(1);
  }

  console.log('=== Site Manager (unifi.ui.com) ===');
  const sitios = await siteManager.listarSitios();
  sitios.forEach((s) => {
    console.log(` - ${s.nombre} | WiFi: ${s.clientesWifi} | Cable: ${s.clientesCable}`);
  });

  console.log('\n=== Clientes con MAC (proxy cloud — sin login local) ===');
  try {
    const { consoleId, clientes } = await siteManager.listarClientesViaProxy(env.UNIFI_SITE_ID, { limit: 15 });
    console.log('Consola:', consoleId.slice(0, 24) + '…');
    console.log('Clientes:', clientes.length);
    clientes.forEach((c) => {
      console.log(` - ${c.nombre || '—'} | ${c.mac} | ${c.ip} | ${c.tipo}`);
    });
  } catch (err) {
    console.log('Proxy cloud:', err.message);
    if (String(err.message).includes('401')) {
      console.log('\nLa API key necesita permisos Network en unifi.ui.com → Settings → API Keys.');
      console.log('Marca: UniFi Applications → Network → sitio ADESA.');
    }
  }

  if (local.habilitado()) {
    console.log('\n=== Fallback API local (opcional) ===');
    try {
      const clientes = await local.listarClientes(env.UNIFI_LOCAL_SITE_ID, { limit: 5 });
      console.log('Clientes local:', clientes.length);
    } catch (err) {
      console.log('Local:', err.message);
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
