'use strict';

const bff = require('../services/ierp-bff.service');

function itemsPaginados(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

async function estado(req, res, next) {
  try {
    return res.json(await bff.estado());
  } catch (e) {
    return next(e);
  }
}

async function resumen(req, res, next) {
  try {
    const stats = await bff.resumenDashboard();
    return res.json({ stats });
  } catch (e) {
    return next(e);
  }
}

async function cotizaciones(req, res, next) {
  try {
    const raw = await bff.listarCotizaciones({
      search: req.query.search,
      page: req.query.page || 1,
    });
    return res.json({ items: itemsPaginados(raw), meta: raw?.meta || null });
  } catch (e) {
    return next(e);
  }
}

async function cotizacionDetalle(req, res, next) {
  try {
    const item = await bff.obtenerCotizacion(req.params.id);
    if (!item) return res.status(404).json({ error: 'Cotización no encontrada.' });
    return res.json(item);
  } catch (e) {
    return next(e);
  }
}

async function facturas(req, res, next) {
  try {
    const raw = await bff.listarFacturas({ search: req.query.search, page: req.query.page || 1 });
    return res.json({ items: itemsPaginados(raw), meta: raw?.meta || null });
  } catch (e) {
    return next(e);
  }
}

async function facturaDetalle(req, res, next) {
  try {
    const item = await bff.obtenerFactura(req.params.id);
    if (!item) return res.status(404).json({ error: 'Factura no encontrada.' });
    return res.json(item);
  } catch (e) {
    return next(e);
  }
}

async function clientes(req, res, next) {
  try {
    const raw = await bff.listarClientes({ search: req.query.search, page: req.query.page || 1 });
    return res.json({ items: itemsPaginados(raw), meta: raw?.meta || null });
  } catch (e) {
    return next(e);
  }
}

async function clienteDetalle(req, res, next) {
  try {
    const item = await bff.obtenerCliente(req.params.id);
    if (!item) return res.status(404).json({ error: 'Cliente no encontrado.' });
    return res.json(item);
  } catch (e) {
    return next(e);
  }
}

async function productos(req, res, next) {
  try {
    const raw = await bff.listarProductos({ search: req.query.search, page: req.query.page || 1 });
    return res.json({ items: itemsPaginados(raw), meta: raw?.meta || null });
  } catch (e) {
    return next(e);
  }
}

async function productoDetalle(req, res, next) {
  try {
    const item = await bff.obtenerProducto(req.params.id);
    if (!item) return res.status(404).json({ error: 'Producto no encontrado.' });
    return res.json(item);
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  estado,
  resumen,
  cotizaciones,
  cotizacionDetalle,
  facturas,
  facturaDetalle,
  clientes,
  clienteDetalle,
  productos,
  productoDetalle,
};
