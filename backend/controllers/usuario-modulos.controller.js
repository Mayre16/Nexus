'use strict';

const svc = require('../services/usuario-modulos.service');

async function catalogo(req, res, next) {
  try {
    res.json({ modulos: svc.modulosAsignables() });
  } catch (err) {
    next(err);
  }
}

async function listarUsuarios(req, res, next) {
  try {
    const usuarios = await svc.listarUsuariosAdmin();
    res.json({ usuarios });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    const data = await svc.obtenerModulosDeUsuario(req.params.uuid);
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function guardar(req, res, next) {
  try {
    const { modulos } = req.body || {};
    const data = await svc.guardarModulosUsuario(
      req.params.uuid,
      modulos,
      req.usuario.id,
    );
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { catalogo, listarUsuarios, obtener, guardar };
