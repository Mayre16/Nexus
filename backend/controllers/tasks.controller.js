'use strict';

const { body, validationResult } = require('express-validator');
const svc = require('../services/tasks.service');
const repo = require('../repositories/tasks.repository');

async function listar(req, res, next) {
  try {
    const tareas = await svc.listar(
      {
        division: req.query.division,
        estado: req.query.estado,
        lead_uuid: req.query.lead_uuid,
        ticket_uuid: req.query.ticket_uuid,
        asignado_uuid: req.query.asignado_uuid,
        buscar: req.query.buscar,
        archivados: req.query.archivados,
        incluir_archivados: req.query.incluir_archivados === '1',
      },
      req.usuario,
    );
    const porEstado = {
      pendiente: tareas.filter((t) => t.estado === 'pendiente'),
      en_progreso: tareas.filter((t) => t.estado === 'en_progreso'),
      completado: tareas.filter((t) => t.estado === 'completado'),
      archivado: tareas.filter((t) => t.estado === 'archivado'),
    };
    return res.json({ tareas, porEstado, total: tareas.length });
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const data = await svc.detalle(req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Tarea no encontrada.' });
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
    if (err.message && /división/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }
    const data = await svc.actualizar(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Tarea no encontrada.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function archivar(req, res, next) {
  try {
    const data = await svc.archivar(req.params.uuid, req.usuario);
    if (!data) return res.status(404).json({ error: 'Tarea no encontrada.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function restaurar(req, res, next) {
  try {
    const data = await svc.restaurar(req.params.uuid, req.usuario);
    if (!data) return res.status(404).json({ error: 'Tarea no encontrada.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function agentes(req, res, next) {
  try {
    const agentesList = await svc.listarAgentes();
    return res.json({ agentes: agentesList });
  } catch (err) {
    return next(err);
  }
}

const validarCrear = [
  body('titulo').isString().trim().isLength({ min: 2, max: 255 }),
  body('descripcion').optional({ nullable: true }).isString().isLength({ max: 65000 }),
  body('division').optional().isIn(repo.DIVISIONES),
  body('prioridad').optional().isIn(repo.PRIORIDADES),
  body('estado').optional().isIn(repo.ESTADOS),
  body('lead_uuid').optional({ nullable: true }).isUUID(),
  body('ticket_uuid').optional({ nullable: true }).isUUID(),
  body('fecha_limite').optional({ nullable: true }).isISO8601().toDate(),
];

const validarActualizar = [
  body('titulo').optional().isString().trim().isLength({ min: 2, max: 255 }),
  body('descripcion').optional({ nullable: true }).isString().isLength({ max: 65000 }),
  body('division').optional().isIn(repo.DIVISIONES),
  body('prioridad').optional().isIn(repo.PRIORIDADES),
  body('estado').optional().isIn(repo.ESTADOS),
  body('lead_uuid').optional({ nullable: true }).isUUID(),
  body('ticket_uuid').optional({ nullable: true }).isUUID(),
  body('asignado_uuid').optional({ nullable: true }).isUUID(),
  body('fecha_limite').optional({ nullable: true }).isISO8601().toDate(),
  body('orden').optional().isInt({ min: 0, max: 99999 }),
];

module.exports = {
  listar,
  detalle,
  crear,
  actualizar,
  archivar,
  restaurar,
  agentes,
  validarCrear,
  validarActualizar,
};
