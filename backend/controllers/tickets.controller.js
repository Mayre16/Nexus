'use strict';

const { validationResult, body, param, query } = require('express-validator');
const ticketsSvc = require('../services/tickets.service');
const imapSvc = require('../services/imapIngestion.service');
const repo = require('../repositories/tickets.repository');

async function listar(req, res, next) {
  try {
    const data = await ticketsSvc.listar(
      {
        division: req.query.division,
        estado: req.query.estado,
        buscar: req.query.buscar,
        limit: req.query.limit,
      },
      req.usuario
    );
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const data = await ticketsSvc.detalle(req.params.uuid, req.usuario);
    if (!data) return res.status(404).json({ error: 'Ticket no encontrado.' });
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
    const data = await ticketsSvc.crear(req.body, req.usuario);
    return res.status(201).json(data);
  } catch (err) {
    if (err.message && /división|División/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const data = await ticketsSvc.actualizar(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Ticket no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function agregarNota(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }
    const data = await ticketsSvc.agregarNota(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Ticket no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function cerrar(req, res, next) {
  try {
    const data = await ticketsSvc.cerrar(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Ticket no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function configMail(req, res) {
  return res.json({ buzones: ticketsSvc.listarBuzonesPublico() });
}

async function agentes(req, res, next) {
  try {
    const filas = await ticketsSvc.listarAgentes();
    return res.json({ agentes: filas });
  } catch (err) {
    return next(err);
  }
}

async function clientesEmpresa(req, res, next) {
  try {
    const filas = await ticketsSvc.listarClientes(req.query.division, req.usuario);
    return res.json({ clientes: filas });
  } catch (err) {
    return next(err);
  }
}

async function pollImap(req, res, next) {
  try {
    const division = req.body?.division;
    const resultados = division
      ? [await imapSvc.pollBuzon(division)]
      : await imapSvc.pollTodosLosBuzones();
    return res.json({ ok: true, resultados });
  } catch (err) {
    return next(err);
  }
}

const validacionCrear = [
  body('asunto').isString().trim().isLength({ min: 3, max: 255 }),
  body('descripcion').optional({ nullable: true }).isString().isLength({ max: 65000 }),
  body('division').optional().isIn(repo.DIVISIONES),
  body('prioridad').optional().isIn(repo.PRIORIDADES),
  body('email_remitente').optional({ nullable: true }).isEmail(),
  body('canal').optional().isIn(['web', 'telefono', 'manual']),
];

const validacionNota = [
  body('contenido').isString().trim().isLength({ min: 1, max: 65000 }),
  body('tipo').optional().isIn(['nota_interna', 'respuesta_cliente']),
  body('estado').optional().isIn(repo.ESTADOS),
];

module.exports = {
  listar,
  detalle,
  crear,
  actualizar,
  agregarNota,
  cerrar,
  configMail,
  agentes,
  clientesEmpresa,
  pollImap,
  validacionCrear,
  validacionNota,
};
