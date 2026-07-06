'use strict';

const hubRepo = require('../repositories/hub.repository');
const usuarioRepo = require('../repositories/usuario.repository');
const umRepo = require('../repositories/usuario-modulos.repository');
const { modulosInstalados } = require('../modules/registry');

const MODULO_POR_PLAN = {
  power_quality: 'power_quality',
  scrapibids: 'scrapibids',
};

async function listarPlanes() {
  return hubRepo.listarPlanes();
}

async function listarSuscripciones(usuario) {
  const esAdmin = usuario.rol === 'admin';
  return hubRepo.listarSuscripciones(usuario.id, esAdmin);
}

async function listarApps(usuario) {
  const { usuarioTieneModulo } = require('../middleware/moduleAccess');
  const hijos = modulosInstalados().filter((m) => m.parentModule === 'hub');

  const suscripciones = await hubRepo.listarSuscripciones(usuario.id, false);
  const planesActivos = new Set(
    suscripciones.filter((s) => s.estado === 'activa').map((s) => s.plan_codigo),
  );

  const apps = [];
  for (const mod of hijos) {
    if (mod.roles && !mod.roles.includes(usuario.rol) && usuario.rol !== 'admin') continue;

    // eslint-disable-next-line no-await-in-loop
    const porAsignacion = await usuarioTieneModulo(usuario, mod.technicalName);
    const porSuscripcion = planesActivos.has(mod.technicalName);
    if (usuario.rol === 'admin' || porAsignacion || porSuscripcion) {
      apps.push({
        technicalName: mod.technicalName,
        displayName: mod.displayName,
        summary: mod.summary,
        icon: mod.icon || '📦',
        href: mod.routes?.ui || mod.routes?.dashboardPath,
      });
    }
  }
  return apps;
}

async function crearSuscripcion(datos, adminId) {
  const plan = await hubRepo.buscarPlanPorCodigo(datos.plan_codigo);
  if (!plan) throw Object.assign(new Error('Plan no encontrado'), { status: 404 });

  const destino = await usuarioRepo.buscarPorUuid(datos.usuario_uuid);
  if (!destino) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });

  const inicio = datos.inicio_en || new Date().toISOString().slice(0, 10);
  const uuid = await hubRepo.crearSuscripcion({
    planId: plan.id,
    usuarioId: destino.id,
    clienteEmpresaId: destino.cliente_empresa_id,
    estado: datos.estado || 'activa',
    inicioEn: inicio,
    renuevaEn: datos.renueva_en || null,
    notas: datos.notas,
  });

  const modulo = MODULO_POR_PLAN[plan.codigo];
  if (modulo) {
    await umRepo.concederModulo(destino.id, modulo, adminId);
    if (plan.codigo === 'power_quality' || plan.codigo === 'scrapibids') {
      await umRepo.concederModulo(destino.id, 'hub', adminId);
    }
  }

  return hubRepo.obtenerSuscripcion(uuid);
}

async function cambiarEstado(uuid, estado, adminId) {
  const sus = await hubRepo.obtenerSuscripcion(uuid);
  if (!sus) throw Object.assign(new Error('Suscripción no encontrada'), { status: 404 });

  await hubRepo.actualizarEstadoSuscripcion(uuid, estado);

  const modulo = MODULO_POR_PLAN[sus.plan_codigo];
  if (modulo && (estado === 'cancelada' || estado === 'suspendida')) {
    await umRepo.revocarModulo(sus.usuario_id, modulo);
  } else if (modulo && estado === 'activa') {
    await umRepo.concederModulo(sus.usuario_id, modulo, adminId);
    await umRepo.concederModulo(sus.usuario_id, 'hub', adminId);
  }

  return hubRepo.obtenerSuscripcion(uuid);
}

module.exports = {
  listarPlanes,
  listarSuscripciones,
  listarApps,
  crearSuscripcion,
  cambiarEstado,
};
