'use strict';

/**
 * performance.controller.js — Nexus Tracker (telemetría BadBoy / MonitorSuite).
 */

const { validationResult, body, param, query } = require('express-validator');
const repo = require('../repositories/performance.repository');
const trackerRed = require('../services/trackerRedService');

/** POST /api/performance/log — recibe lote del agente Windows (HMAC). */
async function recibirLog(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Payload inválido.', detalles: errores.array() });
    }

    const uuid = await repo.guardarReporte(req.dispositivo.id, req.body);
    return res.status(201).json({ ok: true, logUuid: uuid });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/performance/resumen?fecha=YYYY-MM-DD — admin/empleado. */
async function resumen(req, res, next) {
  try {
    const rango = repo.resolverRango(req.query);
    const filas = await repo.resumenPorRango(rango.desde, rango.hasta);
    return res.json({ ...rango, empleados: filas });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/performance/dispositivo/:uuid?periodo=dia|semana|mes */
async function detalle(req, res, next) {
  try {
    const rango = repo.resolverRango(req.query);
    const data = await repo.detalleDispositivo(req.params.uuid, rango.desde, rango.hasta);
    if (!data) return res.status(404).json({ error: 'Dispositivo no encontrado.' });
    return res.json({ ...rango, ...data });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/performance/red/clientes?usuario_uuid=&tipo= */
async function clientesRed(req, res, next) {
  try {
    const data = await trackerRed.listarClientesRed({
      usuario_uuid: req.query.usuario_uuid || null,
      tipo: req.query.tipo || null,
      solo_pendientes: req.query.solo_pendientes,
    });
    return res.json(data);
  } catch (err) {
    if (String(err.message).includes('UNIFI_SITE_MANAGER')) {
      return res.json({
        habilitado: false,
        mensaje: err.message,
        clientes: [],
        usuarios: [],
        empleados: [],
        tipos: Object.values(trackerRed.TIPOS_DISPOSITIVO),
        resumen: {},
      });
    }
    return next(err);
  }
}

/** PUT /api/performance/red/clientes/:mac — asignar usuario/alias/tipo */
async function asignarRedCliente(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }
    await trackerRed.asignarDispositivoRed(req.params.mac, req.body);
    const data = await trackerRed.listarClientesRed({});
    return res.json({ ok: true, ...data });
  } catch (err) {
    if (err.message && /inválid|no encontrado/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

const validacionAsignacionRed = [
  body('usuario_uuid').optional({ nullable: true }).isUUID(),
  body('alias').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('tipo_dispositivo').optional({ nullable: true }).isIn([
    'pc', 'laptop', 'mac', 'tablet', 'telefono', 'voip', 'impresora', 'streaming', 'otro',
  ]),
  body('nota').optional({ nullable: true }).isString().isLength({ max: 255 }),
];

const validacionLog = [
  body('periodStart').isISO8601().withMessage('periodStart inválido.'),
  body('periodEnd').isISO8601().withMessage('periodEnd inválido.'),
  body('machineName').isString().isLength({ max: 120 }),
  body('windowsUser').optional().isString().isLength({ max: 120 }),
  body('sessionStatus').optional().isString(),
  body('activeSeconds').optional().isInt({ min: 0 }),
  body('idleSeconds').optional().isInt({ min: 0 }),
  body('apps').optional().isArray({ max: 100 }),
  body('urls').optional().isArray({ max: 100 }),
];

/** GET /api/performance/reglas-categoria — reglas del usuario autenticado. */
async function listarReglas(req, res, next) {
  try {
    const reglas = await repo.reglasCategoriaUsuario(req.usuario.id);
    return res.json({ reglas });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/performance/reglas-categoria — añadir regla propia. */
async function crearRegla(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }
    const regla = await repo.crearReglaCategoria(req.usuario.id, req.body);
    return res.status(201).json({ ok: true, regla });
  } catch (err) {
    if (err.message && /inválid|vacío|largo/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

/** DELETE /api/performance/reglas-categoria/:id */
async function borrarRegla(req, res, next) {
  try {
    const ok = await repo.eliminarReglaCategoria(req.usuario.id, parseInt(req.params.id, 10));
    if (!ok) return res.status(404).json({ error: 'Regla no encontrada.' });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

const validacionRegla = [
  body('patron').isString().trim().isLength({ min: 1, max: 120 }),
  body('categoria').isIn(['trabajo', 'investigacion', 'ocio', 'otro', 'oina']),
  body('nota').optional({ nullable: true }).isString().isLength({ max: 255 }),
  body('prioridad').optional().isInt({ min: 0, max: 255 }),
];

module.exports = {
  recibirLog,
  resumen,
  detalle,
  clientesRed,
  asignarRedCliente,
  listarReglas,
  crearRegla,
  borrarRegla,
  validacionLog,
  validacionRegla,
  validacionAsignacionRed,
};
