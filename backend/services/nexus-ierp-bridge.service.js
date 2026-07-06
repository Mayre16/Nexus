'use strict';

const bridge = require('../repositories/nexus-ierp-bridge.repository');
const { query } = require('../config/database');

/**
 * Capa de servicio: Nexus (ADM) ↔ módulo iERP en la misma BD MySQL.
 * Resuelve tenant por división y expone helpers para integraciones (leads, store, almacén).
 */

function divisionDesdeUsuario(usuario) {
  if (!usuario) return 'energia';
  if (usuario.division === 'deportes') return 'deportes';
  if (usuario.division === 'energia') return 'energia';
  return 'energia';
}

async function tenantParaDivision(division) {
  const tenant = await bridge.obtenerTenantPorDivision(division);
  if (!tenant) {
    const err = new Error(
      `No hay tenant iERP vinculado a la división "${division}". Ejecute: node backend/scripts/seed-ierp-unified.js`,
    );
    err.code = 'IERP_TENANT_MISSING';
    throw err;
  }
  return tenant;
}

async function tenantParaUsuario(usuario) {
  return tenantParaDivision(divisionDesdeUsuario(usuario));
}

async function obtenerConfigUnificada() {
  const rows = await query(
    `SELECT valor_json FROM nexus_config WHERE clave = 'ierp_unified_db' LIMIT 1`,
  );
  if (!rows[0]) return null;
  const raw = rows[0].valor_json;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function actualizarMapaDivisiones({ tenantId, divisionMap, businessLineMap }) {
  const actual = (await obtenerConfigUnificada()) || {};
  const merged = {
    ...actual,
    division_tenant_map: { ...(actual.division_tenant_map || {}), ...(divisionMap || {}) },
    business_line_map: { ...(actual.business_line_map || {}), ...(businessLineMap || {}) },
  };
  if (tenantId) merged.tenant_principal_id = tenantId;

  await query(
    `INSERT INTO nexus_config (clave, valor_json, categoria, secreto)
     VALUES ('ierp_unified_db', ?, 'integrations', 0)
     ON DUPLICATE KEY UPDATE valor_json = VALUES(valor_json)`,
    [JSON.stringify(merged)],
  );
  return merged;
}

async function estadoUnificacion() {
  const [tenants, vinculos, config] = await Promise.all([
    bridge.listarTenants(),
    query(`SELECT entidad_nexus, entidad_ierp, COUNT(*) AS total
             FROM nexus_ierp_entidades GROUP BY entidad_nexus, entidad_ierp`),
    obtenerConfigUnificada(),
  ]);
  return {
    motor: 'mysql',
    unificado: true,
    tenants,
    vinculos_por_tipo: vinculos,
    config,
  };
}

module.exports = {
  divisionDesdeUsuario,
  tenantParaDivision,
  tenantParaUsuario,
  obtenerConfigUnificada,
  actualizarMapaDivisiones,
  estadoUnificacion,
  ...bridge,
};
