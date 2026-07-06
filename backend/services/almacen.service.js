'use strict';

const repo = require('../repositories/almacen.repository');
const ubic = require('../repositories/almacen-ubicaciones.repository');

async function listar(filtros, usuario) {
  return repo.listarCola(filtros, usuario);
}

async function detalle(uuid) {
  const base = await repo.obtenerDetalle(uuid);
  if (!base) return null;
  const picking = await ubic.obtenerEstadoPicking(uuid);
  return { ...base, picking };
}

async function actualizarEstado(uuid, body, usuario) {
  return repo.actualizarEstado(uuid, body.estado, usuario.id, body.notas);
}

async function listarUbicaciones(almacenId) {
  return ubic.listarUbicaciones(almacenId);
}

async function crearUbicacion(body, usuario) {
  if (usuario.rol !== 'admin') throw new Error('Solo administradores pueden crear ubicaciones.');
  return ubic.crearUbicacion(body);
}

async function estadoPicking(uuid) {
  return ubic.obtenerEstadoPicking(uuid);
}

async function iniciarPicking(uuid, usuario) {
  return ubic.iniciarPicking(uuid, usuario.id);
}

async function registrarPick(uuid, body, usuario) {
  return ubic.registrarPick(uuid, body, usuario.id);
}

async function completarPicking(uuid, usuario) {
  return ubic.completarPicking(uuid, usuario.id);
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
