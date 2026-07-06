'use strict';

const { validationResult, body } = require('express-validator');
const svc = require('../services/store.service');
const repo = require('../repositories/store.repository');

async function productos(req, res, next) {
  try {
    const data = await svc.listarProductos(req.usuario, req.query.division);
    return res.json({ productos: data, adm: await svc.estadoAdm() });
  } catch (err) {
    return next(err);
  }
}

async function listarPedidos(req, res, next) {
  try {
    const data = await svc.listarPedidos(
      { division: req.query.division, estado: req.query.estado },
      req.usuario
    );
    return res.json({ pedidos: data, adm: await svc.estadoAdm() });
  } catch (err) {
    return next(err);
  }
}

async function detallePedido(req, res, next) {
  try {
    const data = await svc.detallePedido(req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Pedido no encontrado.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function crearPedido(req, res, next) {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: errores.array() });
    }
    const creado = await svc.crearPedido(req.body, req.usuario);
    const pedido = await svc.detallePedido(creado.uuid);
    return res.status(201).json(pedido);
  } catch (err) {
    if (err.message && /Stock|división|línea/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

async function estadoAdm(req, res, next) {
  try {
    return res.json(await svc.estadoAdm());
  } catch (err) {
    return next(err);
  }
}

async function syncAdm(req, res, next) {
  try {
    return res.json(await svc.syncAdm(req.body.division));
  } catch (err) {
    return next(err);
  }
}

const validarPedido = [
  body('division').optional().isIn(['energia', 'deportes']),
  body('lineas').isArray({ min: 1 }),
  body('lineas.*.producto_uuid').isUUID(),
  body('lineas.*.cantidad').isInt({ min: 1, max: 9999 }),
];

module.exports = {
  productos,
  listarPedidos,
  detallePedido,
  crearPedido,
  estadoAdm,
  syncAdm,
  validarPedido,
};
