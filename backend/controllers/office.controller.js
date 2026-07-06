'use strict';

const { validationResult, body, param } = require('express-validator');
const svc = require('../services/office.service');
const repo = require('../repositories/office.repository');

async function listar(req, res, next) {
  try {
    const data = await svc.listar(
      { division: req.query.division, estado: req.query.estado },
      req.usuario
    );
    return res.json({ leads: data });
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const data = await svc.detalle(req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Lead no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function crear(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }
    const data = await svc.crear(req.body, req.usuario);
    const lead = await repo.obtenerLead(data.uuid);
    return res.status(201).json(lead);
  } catch (err) {
    if (err.message && /división|requerido/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const data = await svc.actualizar(req.params.uuid, req.body);
    if (!data) return res.status(404).json({ error: 'Lead no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

const validarCrear = [
  body('nombre_contacto').trim().isLength({ min: 2, max: 120 }),
  body('division').optional().isIn(['energia', 'deportes']),
  body('estado').optional().isIn(repo.ESTADOS),
  body('email').optional({ values: 'falsy' }).isEmail(),
];

module.exports = { listar, detalle, crear, actualizar, validarCrear };
