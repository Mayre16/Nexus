'use strict';

const configSvc = require('../services/config.service');
const mailSvc = require('../services/mail.service');

async function listar(req, res, next) {
  try {
    const data = await configSvc.listarParaAdmin();
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function guardarSmtp(req, res, next) {
  try {
    const division = req.params.division === 'deportes' ? 'deportes' : 'energia';
    const data = await configSvc.guardarSmtp(division, req.body, req.usuario.id);
    return res.json({ ok: true, smtp: { division, configured: Boolean(data.host && data.password) } });
  } catch (err) {
    return next(err);
  }
}

async function guardarNotificaciones(req, res, next) {
  try {
    const seccion = req.params.seccion === 'leads' ? 'leads' : 'tickets';
    const data = await configSvc.guardarNotificaciones(seccion, req.body, req.usuario.id);
    return res.json({ ok: true, notifications: data });
  } catch (err) {
    return next(err);
  }
}

async function guardarIntegracion(req, res, next) {
  try {
    const data = await configSvc.guardarIntegracion(req.params.nombre, req.body, req.usuario.id);
    return res.json({ ok: true, integrations: data });
  } catch (err) {
    if (err.message?.includes('desconocida')) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

async function guardarGeneral(req, res, next) {
  try {
    const data = await configSvc.guardarGeneral(req.body, req.usuario.id);
    return res.json({ ok: true, general: data });
  } catch (err) {
    return next(err);
  }
}

async function probarSmtp(req, res) {
  try {
    const division = req.body.division === 'deportes' ? 'deportes' : 'energia';
    const to = req.body.to || req.usuario.email;
    if (!to) return res.status(400).json({ error: 'Indique correo destino.' });
    const result = await mailSvc.probarSmtp(division, to);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listar,
  guardarSmtp,
  guardarNotificaciones,
  guardarIntegracion,
  guardarGeneral,
  probarSmtp,
};
