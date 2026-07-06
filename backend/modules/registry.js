'use strict';

/**
 * Registro central de módulos Nexus (estilo Odoo addons).
 * Cada subcarpeta en backend/modules/ con manifest.json es un módulo.
 */

const path = require('path');
const fs = require('fs');
const { env } = require('../config/env');

const MODULES_DIR = __dirname;

const CATEGORY_LABELS = {
  platform: 'Plataforma',
  service: 'Servicio',
  crm: 'CRM y ventas',
  sales: 'Comercio',
  monitoring: 'Monitoreo',
  memberships: 'Membresías',
  erp: 'ERP',
};

function cargarManifest(nombreCarpeta) {
  const ruta = path.join(MODULES_DIR, nombreCarpeta, 'manifest.json');
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (err) {
    console.warn(`[MOD] manifest inválido en ${nombreCarpeta}:`, err.message);
    return null;
  }
}

function modulosDeshabilitadosPorEnv() {
  const raw = env.MODULES_DISABLED || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function moduloHabilitado(manifest) {
  const name = manifest.technicalName;
  if (name === 'ierp' && !env.IERP_ENABLED) return false;
  if (modulosDeshabilitadosPorEnv().has(name)) return false;
  if (manifest.installable === false && manifest.showInDashboard === false) return false;
  return true;
}

function normalizarModulo(manifest, nombreCarpeta) {
  const external = manifest.external === true;
  return {
    ...manifest,
    technicalName: manifest.technicalName || nombreCarpeta,
    external,
    builtin: !external,
    enabled: true,
    state: manifest.state || 'installed',
    showInDashboard: manifest.showInDashboard !== false,
    categoryLabel: CATEGORY_LABELS[manifest.category] || manifest.category,
    sortOrder: manifest.sortOrder ?? 999,
  };
}

function descubrirModulos() {
  const carpetas = fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const modulos = [];
  for (const carpeta of carpetas) {
    const manifest = cargarManifest(carpeta);
    if (!manifest) continue;
    const mod = normalizarModulo(manifest, carpeta);
    if (moduloHabilitado(mod)) {
      modulos.push(mod);
    }
  }

  return modulos.sort((a, b) => a.sortOrder - b.sortOrder);
}

function modulosInstalados() {
  return descubrirModulos();
}

function toPublicView(m) {
  return {
    technicalName: m.technicalName,
    displayName: m.displayName,
    summary: m.summary,
    version: m.version,
    category: m.category,
    categoryLabel: m.categoryLabel,
    icon: m.icon || '📦',
    external: Boolean(m.external),
    builtin: Boolean(m.builtin),
    state: m.state,
    routes: m.routes,
    depends: m.depends || [],
    sortOrder: m.sortOrder,
  };
}

function filtrarPorRolYAsignacion(modulos, usuario, asignados) {
  return modulos
    .filter((m) => m.showInDashboard !== false)
    .filter((m) => !m.roles || m.roles.includes(usuario.rol))
    .filter((m) => {
      if (usuario.rol === 'admin') return true;
      if (!m.requiresAssignment) return true;
      return asignados.has(m.technicalName);
    });
}

function listarParaUsuario(rol) {
  return modulosInstalados()
    .filter((m) => m.showInDashboard !== false)
    .filter((m) => !m.roles || m.roles.includes(rol))
    .map(toPublicView);
}

async function listarParaUsuarioAsync(usuario, asignados) {
  const set = asignados instanceof Set ? asignados : new Set(asignados || []);
  return filtrarPorRolYAsignacion(modulosInstalados(), usuario, set).map(toPublicView);
}

async function listarAgrupadoParaUsuarioAsync(usuario, asignados) {
  const modulos = await listarParaUsuarioAsync(usuario, asignados);
  return agruparModulos(modulos);
}

function agruparModulos(modulos) {
  const instalados = modulos.filter((m) => m.state === 'installed');
  const enDesarrollo = modulos.filter((m) => m.state === 'development');
  const porCategoria = {};

  for (const m of modulos) {
    const key = m.category || 'other';
    if (!porCategoria[key]) {
      porCategoria[key] = {
        category: key,
        categoryLabel: m.categoryLabel || key,
        modulos: [],
      };
    }
    porCategoria[key].modulos.push(m);
  }

  return {
    instalados,
    enDesarrollo,
    porCategoria: Object.values(porCategoria).sort((a, b) => {
      const order = ['platform', 'crm', 'sales', 'erp', 'service', 'monitoring', 'memberships'];
      return order.indexOf(a.category) - order.indexOf(b.category);
    }),
    total: modulos.length,
  };
}

function listarAgrupadoParaUsuario(rol) {
  return agruparModulos(listarParaUsuario(rol));
}

function obtenerModulo(nombre) {
  return modulosInstalados().find((m) => m.technicalName === nombre) || null;
}

module.exports = {
  CATEGORY_LABELS,
  modulosInstalados,
  listarParaUsuario,
  listarParaUsuarioAsync,
  listarAgrupadoParaUsuario,
  listarAgrupadoParaUsuarioAsync,
  obtenerModulo,
};
