'use strict';

const path = require('path');
const fs = require('fs');
const svc = require('../services/power-quality.service');
const pqRepo = require('../repositories/power-quality.repository');

async function listar(req, res, next) {
  try {
    res.json({ proyectos: await svc.listarProyectos(req.usuario) });
  } catch (err) {
    next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const data = await svc.obtenerDetalle(req.usuario, req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const result = await svc.crearYProcesar(req.usuario, req.body, req.files);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function descargar(req, res, next) {
  try {
    const data = await svc.obtenerDetalle(req.usuario, req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const reporte = data.archivos.find((a) => a.tipo === 'reporte');
    if (!reporte) return res.status(404).json({ error: 'Reporte aún no generado' });
    const abs = path.join(pqRepo.STORAGE, reporte.ruta_storage);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Archivo no encontrado' });
    res.download(abs, reporte.nombre_original);
  } catch (err) {
    next(err);
  }
}

async function plantillas(req, res, next) {
  try {
    res.json({ plantillas: await svc.listarPlantillas(req.usuario) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, detalle, crear, descargar, plantillas };
