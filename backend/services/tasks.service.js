'use strict';

const repo = require('../repositories/tasks.repository');
const { query } = require('../config/database');

function divisionDefault(usuario, bodyDivision) {
  if (bodyDivision && repo.DIVISIONES.includes(bodyDivision)) {
    return bodyDivision;
  }
  if (usuario.division === 'deportes') return 'deportes';
  if (usuario.division === 'energia') return 'energia';
  return 'interno';
}

async function listar(filtros, usuario) {
  return repo.listar(filtros, usuario);
}

async function detalle(uuid) {
  return repo.obtenerPorUuid(uuid);
}

async function crear(body, usuario) {
  const division = divisionDefault(usuario, body.division);
  if (usuario.rol !== 'admin' && usuario.division !== 'ambas') {
    const userDiv = usuario.division === 'deportes' ? 'deportes' : 'energia';
    if (division !== userDiv && division !== 'interno') {
      throw new Error('División no autorizada para esta tarea.');
    }
  }

  let asignadoId = null;
  if (body.asignado_uuid) {
    asignadoId = await repo.resolverAsignadoId(body.asignado_uuid);
  }

  const { uuid } = await repo.crear(
    {
      division,
      titulo: body.titulo.trim(),
      descripcion: body.descripcion?.trim() || null,
      prioridad: body.prioridad,
      etiquetas: normalizarEtiquetas(body.etiquetas),
      lead_uuid: body.lead_uuid || null,
      ticket_uuid: body.ticket_uuid || null,
      ierp_activity_id: body.ierp_activity_id || null,
      asignado_id: asignadoId,
      fecha_limite: body.fecha_limite || null,
      orden: body.orden,
    },
    usuario.id,
  );
  return repo.obtenerPorUuid(uuid);
}

async function actualizar(uuid, body, usuario) {
  const actual = await repo.obtenerPorUuid(uuid);
  if (!actual) return null;

  const patch = {};
  if (body.titulo != null) patch.titulo = String(body.titulo).trim().slice(0, 255);
  if (body.descripcion != null) patch.descripcion = String(body.descripcion).slice(0, 65000);
  if (body.division) patch.division = body.division;
  if (body.prioridad) patch.prioridad = body.prioridad;
  if (body.etiquetas != null) patch.etiquetas = normalizarEtiquetas(body.etiquetas);
  if (body.lead_uuid !== undefined) patch.lead_uuid = body.lead_uuid || null;
  if (body.ticket_uuid !== undefined) patch.ticket_uuid = body.ticket_uuid || null;
  if (body.ierp_activity_id !== undefined) patch.ierp_activity_id = body.ierp_activity_id || null;
  if (body.orden != null) patch.orden = body.orden;
  if (body.fecha_limite !== undefined) patch.fecha_limite = body.fecha_limite || null;
  if (body.estado) patch.estado = body.estado;
  if (body.asignado_uuid !== undefined) {
    patch.asignado_id = body.asignado_uuid
      ? await repo.resolverAsignadoId(body.asignado_uuid)
      : null;
  }

  if (patch.estado === 'archivado') {
    patch.archivado_por = usuario.id;
  }

  const ok = await repo.actualizar(uuid, patch);
  if (!ok) return actual;
  return repo.obtenerPorUuid(uuid);
}

async function archivar(uuid, usuario) {
  return actualizar(uuid, { estado: 'archivado' }, usuario);
}

async function restaurar(uuid, usuario) {
  return actualizar(uuid, { estado: 'pendiente' }, usuario);
}

async function listarAgentes() {
  return query(
    `SELECT uuid, nombre_completo, email, division, rol
       FROM usuarios
      WHERE activo = 1 AND rol IN ('admin','empleado')
      ORDER BY nombre_completo`,
  );
}

function normalizarEtiquetas(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 20);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((t) => t.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

module.exports = {
  listar,
  detalle,
  crear,
  actualizar,
  archivar,
  restaurar,
  listarAgentes,
};
