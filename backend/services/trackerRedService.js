'use strict';

const { env } = require('../config/env');
const unifi = require('./unifiSiteManager');
const redRepo = require('../repositories/trackerRed.repository');
const {
  TIPOS_DISPOSITIVO,
  normalizarMac,
  nombrePendiente,
  clasificarTipoDispositivo,
} = require('../utils/redDeviceClassifier');

function autoAsignarUsuario(cliente, equipos) {
  const nombre = String(cliente.nombre || '').toLowerCase();
  if (!nombre || nombrePendiente(cliente.nombre, cliente.mac)) return null;

  for (const eq of equipos) {
    const host = String(eq.nombre_equipo || '').toLowerCase();
    const primerNombre = String(eq.nombre_completo || '').split(/[\s(]/)[0].toLowerCase();
    const emailLocal = String(eq.email || '').split('@')[0].toLowerCase().replace(/\./g, '');

    if (host.length >= 3 && (nombre.includes(host) || host.includes(nombre))) return eq;
    if (primerNombre.length >= 3 && nombre.includes(primerNombre)) return eq;
    if (emailLocal.length >= 3 && nombre.includes(emailLocal)) return eq;
  }
  return null;
}

function enriquecerCliente(raw, asigMap, equipos) {
  const mac = normalizarMac(raw.mac);
  const asig = asigMap.get(mac);
  const auto = asig?.usuario_id ? null : autoAsignarUsuario(raw, equipos);
  const pendiente = nombrePendiente(raw.nombre, mac);
  const displayNombre = asig?.alias || (pendiente ? null : raw.nombre) || null;
  const tipo = clasificarTipoDispositivo(
    displayNombre || raw.nombre,
    raw.tipo,
    asig?.tipo_dispositivo
  );

  const usuarioId = asig?.usuario_id || auto?.usuario_id || null;
  const usuarioUuid = asig?.usuario_uuid || auto?.usuario_uuid || null;
  const usuarioNombre = asig?.nombre_completo || auto?.nombre_completo || null;

  return {
    id: raw.id,
    mac,
    ip: raw.ip || null,
    nombre: displayNombre,
    nombre_red: raw.nombre || null,
    pendiente_identificar: pendiente && !asig?.alias,
    conexion: raw.tipo === 'WIRED' ? 'Cable' : 'WiFi',
    tipo_dispositivo: tipo,
    tipo_label: TIPOS_DISPOSITIVO[tipo]?.label || tipo,
    usuario_uuid: usuarioUuid,
    usuario_nombre: usuarioNombre,
    asignacion: asig ? 'manual' : auto ? 'auto' : null,
    conectado_en: raw.conectadoEn || null,
    nota: asig?.nota || null,
  };
}

async function listarClientesRed(filtros = {}) {
  const usuarios = await redRepo.listarUsuariosTracker();
  const empleados = await redRepo.listarEmpleadosAsignacion();

  if (!env.UNIFI_SITE_MANAGER_ENABLED || !env.UNIFI_SITE_MANAGER_API_KEY) {
    return {
      habilitado: false,
      mensaje: 'UniFi Site Manager no configurado.',
      clientes: [],
      usuarios,
      empleados,
      tipos: Object.values(TIPOS_DISPOSITIVO),
      resumen: {},
    };
  }

  const [unifiData, asignaciones, equipos] = await Promise.all([
    unifi.listarClientesViaProxy(null, { limit: 300 }),
    redRepo.listarAsignacionesMac(),
    redRepo.listarEquiposTracker(),
  ]);

  const asigMap = new Map(asignaciones.map((a) => [normalizarMac(a.mac), a]));
  let clientes = (unifiData.clientes || []).map((c) => enriquecerCliente(c, asigMap, equipos));

  if (filtros.usuario_uuid === 'sin_asignar') {
    clientes = clientes.filter((c) => !c.usuario_uuid);
  } else if (filtros.usuario_uuid) {
    clientes = clientes.filter((c) => c.usuario_uuid === filtros.usuario_uuid);
  }

  if (filtros.tipo && filtros.tipo !== 'todos') {
    clientes = clientes.filter((c) => c.tipo_dispositivo === filtros.tipo);
  }

  if (filtros.solo_pendientes === '1' || filtros.solo_pendientes === true) {
    clientes = clientes.filter((c) => c.pendiente_identificar);
  }

  clientes.sort((a, b) => {
    if (a.pendiente_identificar !== b.pendiente_identificar) {
      return a.pendiente_identificar ? 1 : -1;
    }
    const na = (a.nombre || a.mac).toLowerCase();
    const nb = (b.nombre || b.mac).toLowerCase();
    return na.localeCompare(nb);
  });

  const resumen = {};
  for (const c of clientes) {
    resumen[c.tipo_dispositivo] = (resumen[c.tipo_dispositivo] || 0) + 1;
  }

  return {
    habilitado: true,
    total: clientes.length,
    total_red: unifiData.clientes?.length || 0,
    clientes,
    usuarios,
    empleados,
    tipos: Object.values(TIPOS_DISPOSITIVO),
    resumen,
  };
}

async function asignarDispositivoRed(mac, datos) {
  const macNorm = await redRepo.guardarAsignacionMac(mac, {
    usuarioUuid: datos.usuario_uuid || null,
    alias: datos.alias,
    tipoDispositivo: datos.tipo_dispositivo,
    nota: datos.nota,
  });
  return listarClientesRed({});
}

module.exports = { listarClientesRed, asignarDispositivoRed, TIPOS_DISPOSITIVO };
