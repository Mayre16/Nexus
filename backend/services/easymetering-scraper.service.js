'use strict';

const path = require('path');
const { spawn } = require('child_process');
const repo = require('../repositories/grid.repository');
const { env } = require('../config/env');
const easymeteringApi = require('./easymetering-api.service');

const SYNC_MODE = (env.EASYMETERING_SYNC_MODE || 'auto').toLowerCase();

function ejecutarWorker(opciones = {}) {
  const scriptPath = path.resolve(__dirname, '../workers/grid/easymetering_sync.py');
  const args = [scriptPath];
  if (opciones.demo) args.push('--demo');

  return new Promise((resolve, reject) => {
    const proc = spawn(env.PYTHON_BIN || 'python', args, {
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        EASYMETERING_BASE_URL: env.EASYMETERING_BASE_URL || 'https://adesa.cloud.easymetering.com',
        EASYMETERING_LOGIN_URL: env.EASYMETERING_LOGIN_URL || 'https://adesa.cloud.easymetering.com/login?next=/',
        EASYMETERING_USER: env.EASYMETERING_USER || '',
        EASYMETERING_PASSWORD: env.EASYMETERING_PASSWORD || '',
        EASYMETERING_ACCESS_TOKEN: env.EASYMETERING_ACCESS_TOKEN || '',
        EASYMETERING_REFRESH_TOKEN: env.EASYMETERING_REFRESH_TOKEN || '',
        EASYMETERING_RECAPTCHA_TOKEN: env.EASYMETERING_RECAPTCHA_TOKEN || '',
      },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      let parsed = {};
      try {
        const line = stdout.trim().split('\n').filter(Boolean).pop() || '{}';
        parsed = JSON.parse(line);
      } catch (_) {
        parsed = { estado: 'error', mensaje: stderr || stdout || 'Respuesta inválida del worker' };
      }
      if (code !== 0 && parsed.estado !== 'demo' && parsed.estado !== 'ok') {
        return reject(Object.assign(new Error(parsed.mensaje || stderr || 'Error en scraper EasyMetering'), { status: 500, parsed }));
      }
      resolve(parsed);
    });
  });
}

async function sincronizarViaApi() {
  const equipos = await easymeteringApi.fetchEquipos();
  const online = equipos.filter((e) => e.estado === 'online').length;
  const offline = equipos.filter((e) => e.estado === 'offline').length;
  const alerta = equipos.filter((e) => e.estado === 'advertencia_offline').length;
  return {
    estado: 'ok',
    mensaje: `API: ${equipos.length} equipos desde ${env.EASYMETERING_BASE_URL}`,
    equipos,
    equipos_total: equipos.length,
    equipos_online: online,
    equipos_offline: offline,
    equipos_alerta: alerta,
    modo: 'api',
  };
}

async function sincronizarAhora(usuario, opciones = {}) {
  const inicio = new Date();
  const tieneToken = Boolean(env.EASYMETERING_ACCESS_TOKEN || env.EASYMETERING_REFRESH_TOKEN);
  const forzarDemo = opciones.demo || (
    !tieneToken && (!env.EASYMETERING_USER || !env.EASYMETERING_PASSWORD)
  );

  let resultado;
  const preferApi = SYNC_MODE === 'api' || (SYNC_MODE === 'auto' && tieneToken && !opciones.forceBrowser);

  if (forzarDemo) {
    resultado = await ejecutarWorker({ demo: true });
  } else if (preferApi) {
    try {
      resultado = await sincronizarViaApi();
    } catch (apiErr) {
      if (SYNC_MODE === 'api') throw apiErr;
      console.warn('[GRID] API falló, usando navegador:', apiErr.message);
      resultado = await ejecutarWorker({});
      resultado.modo = 'browser';
    }
  } else {
    resultado = await ejecutarWorker({});
    resultado.modo = 'browser';
  }

  const equipos = Array.isArray(resultado.equipos) ? resultado.equipos : [];

  const syncId = await repo.registrarSync({
    inicio_en: inicio,
    fin_en: new Date(),
    estado: resultado.estado === 'demo' ? 'demo' : (resultado.estado || 'ok'),
    equipos_total: resultado.equipos_total ?? equipos.length,
    equipos_online: resultado.equipos_online ?? equipos.filter((e) => e.estado === 'online').length,
    equipos_offline: resultado.equipos_offline ?? equipos.filter((e) => e.estado === 'offline').length,
    equipos_alerta: resultado.equipos_alerta ?? equipos.filter((e) => e.estado === 'advertencia_offline').length,
    mensaje: resultado.mensaje || null,
    creado_por: usuario?.id || null,
  });

  for (const item of equipos) {
    await repo.upsertEquipoDesdeSync({ ...item, plataforma: item.plataforma || 'adesa_cloud' }, syncId);
  }

  return {
    sync_id: syncId,
    estado: resultado.estado,
    mensaje: resultado.mensaje,
    equipos_total: equipos.length,
    modo_demo: forzarDemo,
    modo: resultado.modo || (forzarDemo ? 'demo' : 'browser'),
  };
}

async function estadoConexion() {
  const api = await easymeteringApi.estadoApi();
  const tieneUsuario = Boolean(env.EASYMETERING_USER && env.EASYMETERING_PASSWORD);
  const tieneToken = Boolean(env.EASYMETERING_ACCESS_TOKEN || env.EASYMETERING_REFRESH_TOKEN);
  let modo = 'demo';
  if (tieneToken) modo = 'api';
  else if (tieneUsuario) modo = 'browser';
  return {
    base_url: env.EASYMETERING_BASE_URL || 'https://adesa.cloud.easymetering.com',
    login_url: env.EASYMETERING_LOGIN_URL || 'https://adesa.cloud.easymetering.com/login?next=/',
    credenciales_configuradas: tieneUsuario || tieneToken,
    modo,
    api,
    sync_mode: SYNC_MODE,
  };
}

module.exports = { sincronizarAhora, estadoConexion, ejecutarWorker };
