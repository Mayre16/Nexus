'use strict';

const { body, validationResult } = require('express-validator');
const svc = require('../services/personas.service');
const repo = require('../repositories/personas.repository');

async function buscar(req, res, next) {
  try {
    const personas = await svc.buscar(req.query.q, req.query.tipo);
    return res.json({ personas });
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const data = await svc.detalle(req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Persona no encontrada.' });
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
    return res.status(201).json(data);
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const data = await svc.actualizar(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Persona no encontrada.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function listarEvento(req, res, next) {
  try {
    const participantes = await svc.listarEvento(req.params.tipo, req.params.ref);
    return res.json({ participantes });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

async function etiquetar(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }
    const data = await svc.etiquetar(req.params.tipo, req.params.ref, req.body, req.usuario);
    return res.status(201).json(data);
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

async function quitar(req, res, next) {
  try {
    const ok = await svc.quitar(req.params.uuid);
    if (!ok) return res.status(404).json({ error: 'Vínculo no encontrado.' });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function meta(req, res) {
  return res.json({
    tipos: repo.TIPOS,
    evento_tipos: repo.EVENTO_TIPOS,
    roles: repo.ROLES,
    acceso_portal: repo.ACCESO,
    rol_labels: svc.ROL_LABEL,
  });
}

const validarCrear = [
  body('nombre_completo').isString().trim().isLength({ min: 2, max: 150 }),
  body('email').optional({ nullable: true }).isEmail(),
  body('tipo').optional().isIn(repo.TIPOS),
  body('division').optional().isIn(['energia', 'deportes', 'ambas', 'interno']),
  body('acceso_portal').optional().isIn(repo.ACCESO),
];

const validarEtiquetar = [
  body('persona_uuid').isUUID(),
  body('rol_participacion').optional().isIn(repo.ROLES),
  body('notificar').optional().isBoolean(),
  body('mensaje').optional().isString().isLength({ max: 500 }),
];

module.exports = {
  buscar,
  detalle,
  crear,
  actualizar,
  listarEvento,
  etiquetar,
  quitar,
  meta,
  validarCrear,
  validarEtiquetar,
};
