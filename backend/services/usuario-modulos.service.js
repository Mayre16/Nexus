'use strict';

const usuarioRepo = require('../repositories/usuario.repository');
const umRepo = require('../repositories/usuario-modulos.repository');
const { modulosInstalados } = require('../modules/registry');

function modulosAsignables() {
  return modulosInstalados()
    .filter((m) => m.technicalName !== 'core')
    .filter((m) => m.showInDashboard !== false || m.parentModule === 'hub')
    .map((m) => ({
      technicalName: m.technicalName,
      displayName: m.parentModule === 'hub' ? `${m.displayName} (Hub)` : m.displayName,
      requiresAssignment: Boolean(m.requiresAssignment),
      parentModule: m.parentModule || null,
      category: m.category,
      icon: m.icon,
    }));
}

async function listarUsuariosAdmin() {
  return usuarioRepo.listarUsuariosAdmin();
}

async function obtenerModulosDeUsuario(uuid) {
  const usuario = await usuarioRepo.buscarPorUuid(uuid);
  if (!usuario) return null;
  const asignados = await umRepo.listarPorUsuario(usuario.id);
  return {
    usuario: {
      uuid: usuario.uuid,
      nombre: usuario.nombre_completo,
      email: usuario.email,
      rol: usuario.rol,
    },
    modulos: asignados.map((r) => r.modulo),
    detalle: asignados,
  };
}

async function guardarModulosUsuario(uuid, modulos, adminId) {
  const usuario = await usuarioRepo.buscarPorUuid(uuid);
  if (!usuario) return null;
  const validos = new Set(modulosAsignables().map((m) => m.technicalName));
  const filtrados = [...new Set((modulos || []).filter((m) => validos.has(m)))];
  await umRepo.reemplazarModulos(usuario.id, filtrados, adminId);
  return obtenerModulosDeUsuario(uuid);
}

module.exports = {
  modulosAsignables,
  listarUsuariosAdmin,
  obtenerModulosDeUsuario,
  guardarModulosUsuario,
};
