'use strict';

const repo = require('../repositories/grid.repository');
const scraper = require('../services/easymetering-scraper.service');

async function resumen(req, res, next) {
  try {
    const plataforma = req.query.plataforma || 'adesa_cloud';
    res.json({
      resumen: await repo.resumen({ plataforma, mes: req.query.mes }),
      conexion: await scraper.estadoConexion(),
      plataformas: await repo.listarPlataformas(),
    });
  } catch (err) {
    next(err);
  }
}

async function informeMes(req, res, next) {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);
    const plataforma = req.query.plataforma || 'adesa_cloud';
    res.json({ informe: await repo.informeMes(mes, plataforma) });
  } catch (err) {
    next(err);
  }
}

async function equipos(req, res, next) {
  try {
    const q = { ...req.query };
    if (!q.plataforma) q.plataforma = 'adesa_cloud';
    const lista = await repo.listarEquipos(q);
    res.json({ equipos: lista });
  } catch (err) {
    next(err);
  }
}

async function equipo(req, res, next) {
  try {
    const eq = await repo.obtenerEquipo(req.params.uuid);
    if (!eq) return res.status(404).json({ error: 'Equipo no encontrado' });
    const mes = await repo.lecturasMes(req.params.uuid);
    res.json({ equipo: eq, consumo_mes: mes });
  } catch (err) {
    next(err);
  }
}

async function actualizarEquipo(req, res, next) {
  try {
    const eq = await repo.actualizarEquipo(req.params.uuid, req.body);
    if (!eq) return res.status(404).json({ error: 'Equipo no encontrado' });
    res.json({ equipo: eq });
  } catch (err) {
    if (err.message === 'Propiedad inválida') return res.status(400).json({ error: err.message });
    next(err);
  }
}

async function clientes(req, res, next) {
  try {
    res.json({ clientes: await repo.listarClientesEnergia() });
  } catch (err) {
    next(err);
  }
}

async function syncs(req, res, next) {
  try {
    res.json({ syncs: await repo.listarSyncs() });
  } catch (err) {
    next(err);
  }
}

async function sincronizar(req, res, next) {
  try {
    const demo = req.body?.demo === true;
    const result = await scraper.sincronizarAhora(req.usuario, { demo });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = { resumen, informeMes, equipos, equipo, actualizarEquipo, clientes, syncs, sincronizar };
