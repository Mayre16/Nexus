'use strict';

const { query, withTransaction } = require('../config/database');

const ENTIDADES_NEXUS = new Set([
  'clientes_empresa',
  'productos',
  'pedidos',
  'almacenes',
  'usuarios',
  'leads',
  'nexus_personas',
]);

const ENTIDADES_IERP = new Set([
  'Company',
  'Product',
  'SalesOrder',
  'Warehouse',
  'User',
  'Invoice',
  'Contact',
  'Employee',
  'BusinessLine',
]);

async function obtenerTenantPorDivision(division) {
  const rows = await query(
    `SELECT * FROM ierp_tenants
      WHERE activo = 1 AND (division = ? OR division = 'ambas')
      ORDER BY CASE division WHEN ? THEN 0 WHEN 'ambas' THEN 1 ELSE 2 END
      LIMIT 1`,
    [division, division],
  );
  return rows[0] || null;
}

async function listarTenants() {
  return query(`SELECT * FROM ierp_tenants WHERE activo = 1 ORDER BY nombre`);
}

async function upsertTenant({ id, division, nombre, dominio, ierpBusinessLineId }) {
  await query(
    `INSERT INTO ierp_tenants (id, division, nombre, dominio, ierp_business_line_id, activo)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       division = VALUES(division),
       nombre = VALUES(nombre),
       dominio = VALUES(dominio),
       ierp_business_line_id = COALESCE(VALUES(ierp_business_line_id), ierp_business_line_id),
       activo = 1`,
    [id, division || 'ambas', nombre, dominio || null, ierpBusinessLineId || null],
  );
  return obtenerTenantPorId(id);
}

async function obtenerTenantPorId(id) {
  const rows = await query(`SELECT * FROM ierp_tenants WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function vincularEntidad({
  ierpTenantId,
  entidadNexus,
  nexusId,
  nexusUuid,
  entidadIerp,
  ierpId,
  origenSync = 'manual',
  metadata,
}) {
  if (!ENTIDADES_NEXUS.has(entidadNexus)) throw new Error(`entidad_nexus inválida: ${entidadNexus}`);
  if (!ENTIDADES_IERP.has(entidadIerp)) throw new Error(`entidad_ierp inválida: ${entidadIerp}`);

  await query(
    `INSERT INTO nexus_ierp_entidades
       (ierp_tenant_id, entidad_nexus, nexus_id, nexus_uuid, entidad_ierp, ierp_id, origen_sync, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nexus_id = COALESCE(VALUES(nexus_id), nexus_id),
       nexus_uuid = COALESCE(VALUES(nexus_uuid), nexus_uuid),
       ierp_id = VALUES(ierp_id),
       origen_sync = VALUES(origen_sync),
       metadata_json = COALESCE(VALUES(metadata_json), metadata_json),
       actualizado_en = CURRENT_TIMESTAMP`,
    [
      ierpTenantId,
      entidadNexus,
      nexusId || null,
      nexusUuid || null,
      entidadIerp,
      ierpId,
      origenSync,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );

  return buscarVinculo({ entidadNexus, nexusId, nexusUuid, entidadIerp, ierpId, ierpTenantId });
}

async function buscarVinculo(filtros) {
  const params = [];
  let sql = 'SELECT * FROM nexus_ierp_entidades WHERE 1=1';
  if (filtros.ierpTenantId) {
    sql += ' AND ierp_tenant_id = ?';
    params.push(filtros.ierpTenantId);
  }
  if (filtros.entidadNexus) {
    sql += ' AND entidad_nexus = ?';
    params.push(filtros.entidadNexus);
  }
  if (filtros.nexusId) {
    sql += ' AND nexus_id = ?';
    params.push(filtros.nexusId);
  }
  if (filtros.nexusUuid) {
    sql += ' AND nexus_uuid = ?';
    params.push(filtros.nexusUuid);
  }
  if (filtros.entidadIerp) {
    sql += ' AND entidad_ierp = ?';
    params.push(filtros.entidadIerp);
  }
  if (filtros.ierpId) {
    sql += ' AND ierp_id = ?';
    params.push(filtros.ierpId);
  }
  sql += ' LIMIT 1';
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function resolverIerpId(entidadNexus, nexusIdOrUuid) {
  const esUuid = typeof nexusIdOrUuid === 'string' && nexusIdOrUuid.includes('-');
  const row = await buscarVinculo(
    esUuid
      ? { entidadNexus, nexusUuid: nexusIdOrUuid }
      : { entidadNexus, nexusId: nexusIdOrUuid },
  );
  return row?.ierp_id || null;
}

async function registrarSyncLog({ direccion, entidad, referencia, estado, detalle }) {
  await query(
    `INSERT INTO nexus_ierp_sync_log (direccion, entidad, referencia, estado, detalle_json)
     VALUES (?, ?, ?, ?, ?)`,
    [direccion, entidad, referencia || null, estado || 'ok', detalle ? JSON.stringify(detalle) : null],
  );
}

async function actualizarColumnaIerp(entidadNexus, nexusId, patch) {
  const mapa = {
    clientes_empresa: ['ierp_company_id', 'ierp_tenant_id'],
    productos: ['ierp_product_id', 'ierp_tenant_id'],
    almacenes: ['ierp_warehouse_id', 'ierp_tenant_id'],
    pedidos: ['ierp_sales_order_id', 'ierp_invoice_id', 'ierp_invoice_estado', 'ierp_tenant_id'],
    usuarios: ['ierp_user_id'],
  };
  const cols = mapa[entidadNexus];
  if (!cols) return;

  const campos = [];
  const params = [];
  for (const col of cols) {
    if (patch[col] !== undefined) {
      campos.push(`${col} = ?`);
      params.push(patch[col]);
    }
  }
  if (!campos.length) return;
  params.push(nexusId);
  await query(`UPDATE ${entidadNexus} SET ${campos.join(', ')} WHERE id = ?`, params);
}

async function vincularYActualizar(datos) {
  return withTransaction(async () => {
    const vinculo = await vincularEntidad(datos);
    if (datos.nexusId) {
      const patch = {};
      if (datos.entidadIerp === 'Company') {
        patch.ierp_company_id = datos.ierpId;
        patch.ierp_tenant_id = datos.ierpTenantId;
      } else if (datos.entidadIerp === 'Product') {
        patch.ierp_product_id = datos.ierpId;
        patch.ierp_tenant_id = datos.ierpTenantId;
      } else if (datos.entidadIerp === 'Warehouse') {
        patch.ierp_warehouse_id = datos.ierpId;
        patch.ierp_tenant_id = datos.ierpTenantId;
      } else if (datos.entidadIerp === 'SalesOrder') {
        patch.ierp_sales_order_id = datos.ierpId;
        patch.ierp_tenant_id = datos.ierpTenantId;
      } else if (datos.entidadIerp === 'Invoice') {
        patch.ierp_invoice_id = datos.ierpId;
        patch.ierp_tenant_id = datos.ierpTenantId;
      } else if (datos.entidadIerp === 'User') {
        patch.ierp_user_id = datos.ierpId;
      }
      if (Object.keys(patch).length) {
        await actualizarColumnaIerp(datos.entidadNexus, datos.nexusId, patch);
      }
    }
    return vinculo;
  });
}

module.exports = {
  ENTIDADES_NEXUS,
  ENTIDADES_IERP,
  obtenerTenantPorDivision,
  obtenerTenantPorId,
  listarTenants,
  upsertTenant,
  vincularEntidad,
  vincularYActualizar,
  buscarVinculo,
  resolverIerpId,
  registrarSyncLog,
};
