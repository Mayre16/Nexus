'use strict';

const express = require('express');
const { autenticar } = require('../middleware/authMiddleware');
const { usuarioTieneModulo } = require('../middleware/moduleAccess');
const {
  listarParaUsuarioAsync,
  listarAgrupadoParaUsuarioAsync,
  obtenerModulo,
} = require('../modules/registry');
const umRepo = require('../repositories/usuario-modulos.repository');
const { env } = require('../config/env');

const router = express.Router();

async function asignadosDe(req) {
  return umRepo.listarTechnicalNames(req.usuario.id);
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const asignados = await asignadosDe(req);
    const modulos = await listarParaUsuarioAsync(req.usuario, asignados);
    res.json({ plataforma: env.APP_NAME, modulos });
  } catch (err) {
    next(err);
  }
});

router.get('/catalogo', autenticar, async (req, res, next) => {
  try {
    const asignados = await asignadosDe(req);
    const catalogo = await listarAgrupadoParaUsuarioAsync(req.usuario, asignados);
    res.json({ plataforma: env.APP_NAME, ...catalogo });
  } catch (err) {
    next(err);
  }
});

router.get('/ierp/estado', autenticar, async (req, res) => {
  if (!env.IERP_ENABLED) {
    return res.json({ habilitado: false, estado: 'disabled' });
  }

  let bdUnificada = null;
  try {
    const bridge = require('../services/nexus-ierp-bridge.service');
    bdUnificada = await bridge.estadoUnificacion();
  } catch (err) {
    bdUnificada = { unificado: false, error: err.message };
  }

  try {
    const url = `${env.IERP_API_URL.replace(/\/$/, '')}/api/health`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const data = r.ok ? await r.json().catch(() => ({})) : null;
    res.json({
      habilitado: true,
      estado: r.ok ? 'online' : 'offline',
      httpStatus: r.status,
      health: data,
      bd: bdUnificada,
      rutas: { ui: '/ierp.html', api: '/api/ierp-nexus' },
    });
  } catch (err) {
    res.json({
      habilitado: true,
      estado: 'offline',
      error: err.message,
      bd: bdUnificada,
      rutas: { ui: '/ierp.html', api: '/api/ierp-nexus' },
    });
  }
});

router.get('/:nombre', autenticar, async (req, res, next) => {
  try {
    const mod = obtenerModulo(req.params.nombre);
    if (!mod || mod.showInDashboard === false) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }
    const ok = await usuarioTieneModulo(req.usuario, mod.technicalName);
    if (!ok) {
      return res.status(403).json({ error: 'Sin permiso para este módulo' });
    }
    res.json({ modulo: mod });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
