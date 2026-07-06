'use strict';

const svc = require('../services/almacen.service');
const repo = require('../repositories/almacen.repository');

async function listar(req, res, next) {
  try {
    const data = await svc.listar(
      {
        division: req.query.division,
        estado: req.query.estado,
        incluirEnviados: req.query.incluir_enviados === '1',
      },
      req.usuario,
    );
    return res.json({ cola: data });
  } catch (err) {
    return next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const data = await svc.detalle(req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Orden de almacén no encontrada.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function actualizarEstado(req, res, next) {
  try {
    const { estado } = req.body;
    if (!repo.ESTADOS_ALMACEN.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }
    const data = await svc.actualizarEstado(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Orden de almacén no encontrada.' });
    const detalle = await svc.detalle(req.params.uuid);
    return res.json(detalle);
  } catch (err) {
    return next(err);
  }
}

async function listarUbicaciones(req, res, next) {
  try {
    const almacenId = req.query.almacen_id ? Number(req.query.almacen_id) : null;
    const ubicaciones = await svc.listarUbicaciones(almacenId);
    return res.json({ ubicaciones });
  } catch (err) {
    return next(err);
  }
}

async function crearUbicacion(req, res, next) {
  try {
    const ubicacion = await svc.crearUbicacion(req.body, req.usuario);
    return res.status(201).json({ ubicacion });
  } catch (err) {
    if (err.message.includes('administradores')) return res.status(403).json({ error: err.message });
    return next(err);
  }
}

async function estadoPicking(req, res, next) {
  try {
    const data = await svc.estadoPicking(req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Orden de almacén no encontrada.' });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function iniciarPicking(req, res, next) {
  try {
    const data = await svc.iniciarPicking(req.params.uuid, req.usuario);
    if (!data) return res.status(404).json({ error: 'Orden de almacén no encontrada.' });
    const picking = await svc.estadoPicking(req.params.uuid);
    return res.json(picking);
  } catch (err) {
    return next(err);
  }
}

async function registrarPick(req, res, next) {
  try {
    const data = await svc.registrarPick(req.params.uuid, req.body, req.usuario);
    if (!data) return res.status(404).json({ error: 'Orden de almacén no encontrada.' });
    const picking = await svc.estadoPicking(req.params.uuid);
    return res.json({ resultado: data, picking });
  } catch (err) {
    if (/Stock|pendiente|SKU|ubicación|asignación/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
}

async function completarPicking(req, res, next) {
  try {
    const data = await svc.completarPicking(req.params.uuid, req.usuario);
    if (!data) return res.status(404).json({ error: 'Orden de almacén no encontrada.' });
    const detalle = await svc.detalle(req.params.uuid);
    return res.json(detalle);
  } catch (err) {
    if (/sin completar/i.test(err.message)) return res.status(400).json({ error: err.message });
    return next(err);
  }
}

module.exports = {
  listar,
  detalle,
  actualizarEstado,
  listarUbicaciones,
  crearUbicacion,
  estadoPicking,
  iniciarPicking,
  registrarPick,
  completarPicking,
};
