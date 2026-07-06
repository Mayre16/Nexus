'use strict';

const path = require('path');
const { spawn } = require('child_process');
const repo = require('../repositories/scrapibids.repository');
const { env } = require('../config/env');

async function obtenerConfig(usuario) {
  const cfg = await repo.obtenerConfig(usuario.id);
  return cfg || {
    palabras_clave: [],
    correo_destino: usuario.email,
    frecuencia: 'diaria',
    hora_ejecucion: '11:00:00',
    dias_semana: '1,2,3,4,5',
    zona_horaria: 'America/Santo_Domingo',
    busqueda_publica: true,
    activo: true,
  };
}

async function guardarConfig(usuario, datos) {
  if (!datos.correo_destino) {
    throw Object.assign(new Error('Correo destino requerido'), { status: 400 });
  }
  const keywords = repo.parseKeywords(datos.palabras_clave);
  if (!keywords.length) {
    throw Object.assign(new Error('Agrega al menos una palabra clave'), { status: 400 });
  }
  return repo.guardarConfig(usuario.id, { ...datos, palabras_clave: keywords });
}

async function listarEjecuciones(usuario) {
  return repo.listarEjecuciones(usuario.id);
}

async function ejecutarAhora(usuario) {
  const cfg = await repo.obtenerConfig(usuario.id);
  if (!cfg || !cfg.activo) {
    throw Object.assign(new Error('Configura y activa ScrapiBids primero'), { status: 400 });
  }

  const scriptPath = path.resolve(__dirname, '../workers/scrapibids/run_user.py');
  const inicio = new Date();

  return new Promise((resolve, reject) => {
    const proc = spawn(
      env.PYTHON_BIN || 'python',
      [scriptPath, '--usuario-id', String(usuario.id)],
      {
        cwd: path.dirname(scriptPath),
        env: {
          ...process.env,
          DB_HOST: env.DB_HOST,
          DB_PORT: String(env.DB_PORT || 3306),
          DB_USER: env.DB_USER,
          DB_PASSWORD: env.DB_PASSWORD,
          DB_NAME: env.DB_NAME,
        },
      },
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', async (code) => {
      let parsed = {};
      try {
        parsed = JSON.parse(stdout.trim().split('\n').pop() || '{}');
      } catch (_) {
        parsed = { estado: code === 0 ? 'ok' : 'error', mensaje: stderr || stdout };
      }
      await repo.registrarEjecucion(usuario.id, {
        inicio_en: inicio,
        fin_en: new Date(),
        estado: parsed.estado || (code === 0 ? 'ok' : 'error'),
        licitaciones_nuevas: parsed.nuevas || 0,
        mensaje: parsed.mensaje || stderr || null,
      });
      if (code !== 0 && parsed.estado !== 'sin_novedades') {
        return reject(Object.assign(new Error(parsed.mensaje || 'Error en scraper'), { status: 500 }));
      }
      resolve(parsed);
    });
    proc.on('error', (err) => reject(err));
  });
}

module.exports = { obtenerConfig, guardarConfig, listarEjecuciones, ejecutarAhora };
