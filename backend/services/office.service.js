'use strict';

const repo = require('../repositories/office.repository');

async function listar(filtros, usuario) {
  return repo.listarLeads(filtros, usuario);
}

async function detalle(uuid) {
  return repo.obtenerLead(uuid);
}

async function crear(body, usuario) {
  const division = body.division || (usuario.division === 'deportes' ? 'deportes' : 'energia');
  if (usuario.rol !== 'admin' && usuario.division !== 'ambas' && usuario.division !== division) {
    throw new Error('No puedes crear leads en otra división.');
  }
  if (!body.nombre_contacto) throw new Error('Nombre de contacto requerido.');
  return repo.crearLead({ ...body, division }, usuario.id);
}

async function actualizar(uuid, body) {
  const ok = await repo.actualizarLead(uuid, body);
  if (!ok) return null;
  return repo.obtenerLead(uuid);
}

module.exports = { listar, detalle, crear, actualizar };
