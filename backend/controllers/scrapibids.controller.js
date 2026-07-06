'use strict';

const svc = require('../services/scrapibids.service');

async function getConfig(req, res, next) {
  try {
    res.json({ config: await svc.obtenerConfig(req.usuario) });
  } catch (err) {
    next(err);
  }
}

async function putConfig(req, res, next) {
  try {
    const config = await svc.guardarConfig(req.usuario, req.body);
    res.json({ config });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function ejecuciones(req, res, next) {
  try {
    res.json({ ejecuciones: await svc.listarEjecuciones(req.usuario) });
  } catch (err) {
    next(err);
  }
}

async function ejecutar(req, res, next) {
  try {
    const result = await svc.ejecutarAhora(req.usuario);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = { getConfig, putConfig, ejecuciones, ejecutar };
