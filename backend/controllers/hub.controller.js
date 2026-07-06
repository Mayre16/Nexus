'use strict';

const svc = require('../services/hub.service');

async function planes(req, res, next) {
  try {
    res.json({ planes: await svc.listarPlanes() });
  } catch (err) {
    next(err);
  }
}

async function suscripciones(req, res, next) {
  try {
    res.json({ suscripciones: await svc.listarSuscripciones(req.usuario) });
  } catch (err) {
    next(err);
  }
}

async function apps(req, res, next) {
  try {
    res.json({ apps: await svc.listarApps(req.usuario) });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const sus = await svc.crearSuscripcion(req.body, req.usuario.id);
    res.status(201).json({ suscripcion: sus });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function patchEstado(req, res, next) {
  try {
    const { estado } = req.body || {};
    const sus = await svc.cambiarEstado(req.params.uuid, estado, req.usuario.id);
    res.json({ suscripcion: sus });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = { planes, suscripciones, apps, crear, patchEstado };
