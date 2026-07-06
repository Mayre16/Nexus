'use strict';

const crypto = require('crypto');
const { query, withTransaction } = require('../config/database');

async function obtenerPedidoAlmacen(uuid) {
  const rows = await query(
    `SELECT pa.*, p.numero, p.division, p.id AS pedido_id
       FROM pedidos_almacen pa
       JOIN pedidos p ON p.id = pa.pedido_id
      WHERE pa.uuid = ? LIMIT 1`,
    [uuid],
  );
  return rows[0] || null;
}

async function listarUbicaciones(almacenId) {
  return query(
    `SELECT u.uuid, u.almacen_id, u.codigo, u.nombre, u.pasillo, u.estante, u.nivel, u.tipo, u.activo,
            a.nombre AS almacen_nombre
       FROM ubicaciones u
       JOIN almacenes a ON a.id = u.almacen_id
      WHERE u.activo = 1 AND (? IS NULL OR u.almacen_id = ?)
      ORDER BY u.codigo`,
    [almacenId || null, almacenId || null],
  );
}

async function crearUbicacion({ almacenId, codigo, nombre, pasillo, estante, nivel, tipo }) {
  const uuid = crypto.randomUUID();
  const cod = (codigo || '').trim().toUpperCase();
  if (!cod || !nombre) throw new Error('Código y nombre son requeridos.');
  await query(
    `INSERT INTO ubicaciones (uuid, almacen_id, codigo, nombre, pasillo, estante, nivel, tipo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [almacenId, cod, nombre, pasillo || null, estante || null, nivel || null, tipo || 'pick'],
  );
  const rows = await query(`SELECT uuid, codigo, nombre FROM ubicaciones WHERE uuid = ?`, [uuid]);
  return rows[0];
}

async function stockPorSku(sku, almacenId) {
  return query(
    `SELECT u.uuid AS ubicacion_uuid, u.codigo, u.nombre, su.cantidad, p.sku
       FROM stock_ubicacion su
       JOIN ubicaciones u ON u.id = su.ubicacion_id
       JOIN productos p ON p.id = su.producto_id
      WHERE p.sku = ? AND su.cantidad > 0
        AND (? IS NULL OR u.almacen_id = ?)
      ORDER BY u.codigo`,
    [sku, almacenId || null, almacenId || null],
  );
}

async function sugerirUbicaciones(productoId, almacenId, cantidadNecesaria) {
  const rows = await query(
    `SELECT u.uuid, u.codigo, u.nombre, su.cantidad
       FROM stock_ubicacion su
       JOIN ubicaciones u ON u.id = su.ubicacion_id
      WHERE su.producto_id = ? AND u.almacen_id = ? AND u.activo = 1 AND su.cantidad > 0
      ORDER BY u.codigo`,
    [productoId, almacenId],
  );
  const sugerencias = [];
  let restante = cantidadNecesaria;
  for (const r of rows) {
    if (restante <= 0) break;
    const tomar = Math.min(restante, r.cantidad);
    sugerencias.push({
      ubicacion_uuid: r.uuid,
      codigo: r.codigo,
      nombre: r.nombre,
      stock_disponible: r.cantidad,
      cantidad_sugerida: tomar,
    });
    restante -= tomar;
  }
  return { sugerencias, faltante: Math.max(0, restante) };
}

async function cantidadPickeada(pedidoAlmacenId, pedidoLineaId) {
  const rows = await query(
    `SELECT COALESCE(SUM(cantidad), 0) AS total
       FROM picking_lineas WHERE pedido_almacen_id = ? AND pedido_linea_id = ?`,
    [pedidoAlmacenId, pedidoLineaId],
  );
  return Number(rows[0]?.total || 0);
}

async function obtenerEstadoPicking(pedidoAlmacenUuid) {
  const pa = await obtenerPedidoAlmacen(pedidoAlmacenUuid);
  if (!pa) return null;

  const lineas = await query(
    `SELECT pl.id, pl.sku, pl.descripcion, pl.cantidad, pl.producto_id
       FROM pedido_lineas pl WHERE pl.pedido_id = ?`,
    [pa.pedido_id],
  );

  const picks = await query(
    `SELECT pl.id AS pick_id, pl.cantidad, pl.pickeado_en,
            u.uuid AS ubicacion_uuid, u.codigo AS ubicacion_codigo,
            pl2.sku
       FROM picking_lineas pl
       JOIN ubicaciones u ON u.id = pl.ubicacion_id
       JOIN pedido_lineas pl2 ON pl2.id = pl.pedido_linea_id
      WHERE pl.pedido_almacen_id = ?
      ORDER BY pl.pickeado_en`,
    [pa.id],
  );

  const picksPorLinea = {};
  for (const p of picks) {
    if (!picksPorLinea[p.sku]) picksPorLinea[p.sku] = [];
    picksPorLinea[p.sku].push(p);
  }

  const lineasDetalle = [];
  for (const ln of lineas) {
    const pickeada = await cantidadPickeada(pa.id, ln.id);
    const pendiente = Math.max(0, ln.cantidad - pickeada);
    const { sugerencias, faltante } = await sugerirUbicaciones(ln.producto_id, pa.almacen_id, pendiente);
    const stockUbicaciones = await stockPorSku(ln.sku, pa.almacen_id);
    lineasDetalle.push({
      id: ln.id,
      sku: ln.sku,
      descripcion: ln.descripcion,
      cantidad_pedida: ln.cantidad,
      cantidad_pickeada: pickeada,
      cantidad_pendiente: pendiente,
      completa: pendiente === 0,
      picks: picksPorLinea[ln.sku] || [],
      sugerencias,
      stock_ubicaciones: stockUbicaciones,
      sin_stock_suficiente: faltante > 0,
    });
  }

  const totalPedido = lineas.reduce((s, l) => s + l.cantidad, 0);
  const totalPickeado = lineasDetalle.reduce((s, l) => s + l.cantidad_pickeada, 0);

  return {
    pedido_almacen_uuid: pa.uuid,
    estado: pa.estado,
    almacen_id: pa.almacen_id,
    picking_completado_en: pa.picking_completado_en,
    progreso: {
      total_unidades: totalPedido,
      pickeadas: totalPickeado,
      pendientes: totalPedido - totalPickeado,
      porcentaje: totalPedido ? Math.round((totalPickeado / totalPedido) * 100) : 0,
      completo: totalPickeado >= totalPedido,
    },
    lineas: lineasDetalle,
  };
}

async function iniciarPicking(uuid, usuarioId) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT * FROM pedidos_almacen WHERE uuid = ? FOR UPDATE`,
      [uuid],
    );
    const pa = rows[0];
    if (!pa) return null;
    if (pa.estado === 'enviado' || pa.estado === 'cancelado') {
      throw new Error('No se puede iniciar picking en este estado.');
    }
    await conn.execute(
      `UPDATE pedidos_almacen SET estado = 'picking', asignado_a = COALESCE(asignado_a, ?) WHERE id = ?`,
      [usuarioId, pa.id],
    );
    return { uuid, estado: 'picking' };
  });
}

async function registrarPick(uuid, { sku, asignaciones }, usuarioId) {
  const skuNorm = (sku || '').trim().toUpperCase();
  if (!skuNorm || !asignaciones?.length) {
    throw new Error('SKU y al menos una asignación (ubicación + cantidad) son requeridos.');
  }

  return withTransaction(async (conn) => {
    const [paRows] = await conn.execute(
      `SELECT pa.*, p.id AS pedido_id, p.numero
         FROM pedidos_almacen pa
         JOIN pedidos p ON p.id = pa.pedido_id
        WHERE pa.uuid = ? FOR UPDATE`,
      [uuid],
    );
    const pa = paRows[0];
    if (!pa) return null;
    if (!['pendiente', 'picking', 'empacado'].includes(pa.estado)) {
      throw new Error('El pedido no está en un estado que permita picking.');
    }

    const [lineaRows] = await conn.execute(
      `SELECT pl.* FROM pedido_lineas pl
        JOIN productos pr ON pr.id = pl.producto_id
       WHERE pl.pedido_id = ? AND pr.sku = ?`,
      [pa.pedido_id, skuNorm],
    );
    const linea = lineaRows[0];
    if (!linea) throw new Error(`El SKU ${skuNorm} no está en este pedido.`);

    const [pickeadoRows] = await conn.execute(
      `SELECT COALESCE(SUM(cantidad), 0) AS total FROM picking_lineas
        WHERE pedido_almacen_id = ? AND pedido_linea_id = ?`,
      [pa.id, linea.id],
    );
    const yaPickeado = Number(pickeadoRows[0].total);
    const pendiente = linea.cantidad - yaPickeado;
    const sumaAsign = asignaciones.reduce((s, a) => s + Number(a.cantidad || 0), 0);
    if (sumaAsign <= 0) throw new Error('Cantidad inválida.');
    if (sumaAsign > pendiente + 0.001) {
      throw new Error(`La cantidad (${sumaAsign}) excede lo pendiente (${pendiente}).`);
    }

    for (const asig of asignaciones) {
      const cant = Number(asig.cantidad);
      if (cant <= 0) continue;
      const ubicUuid = asig.ubicacion_uuid;
      if (!ubicUuid) throw new Error('Cada asignación requiere ubicacion_uuid.');

      const [ubicRows] = await conn.execute(
        `SELECT u.id FROM ubicaciones u
          WHERE u.uuid = ? AND u.almacen_id = ? AND u.activo = 1`,
        [ubicUuid, pa.almacen_id],
      );
      const ubic = ubicRows[0];
      if (!ubic) throw new Error('Ubicación no válida para este almacén.');

      const [stockRows] = await conn.execute(
        `SELECT id, cantidad FROM stock_ubicacion
          WHERE producto_id = ? AND ubicacion_id = ? FOR UPDATE`,
        [linea.producto_id, ubic.id],
      );
      const stock = stockRows[0];
      if (!stock || stock.cantidad < cant) {
        throw new Error(`Stock insuficiente en la ubicación seleccionada.`);
      }

      await conn.execute(
        `UPDATE stock_ubicacion SET cantidad = cantidad - ? WHERE id = ?`,
        [cant, stock.id],
      );
      await conn.execute(
        `INSERT INTO picking_lineas
           (pedido_almacen_id, pedido_linea_id, producto_id, ubicacion_id, cantidad, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pa.id, linea.id, linea.producto_id, ubic.id, cant, usuarioId],
      );
      await conn.execute(
        `INSERT INTO movimientos_inventario
           (producto_id, almacen_id, ubicacion_id, tipo, cantidad, pedido_id, referencia)
         VALUES (?, ?, ?, 'salida', ?, ?, ?)`,
        [
          linea.producto_id,
          pa.almacen_id,
          ubic.id,
          -cant,
          pa.pedido_id,
          `Pick ${skuNorm} pedido #${pa.numero}`,
        ],
      );
    }

    if (pa.estado === 'pendiente') {
      await conn.execute(
        `UPDATE pedidos_almacen SET estado = 'picking', asignado_a = COALESCE(asignado_a, ?) WHERE id = ?`,
        [usuarioId, pa.id],
      );
    }

    const [nuevoPickeado] = await conn.execute(
      `SELECT COALESCE(SUM(cantidad), 0) AS total FROM picking_lineas
        WHERE pedido_almacen_id = ? AND pedido_linea_id = ?`,
      [pa.id, linea.id],
    );
    return {
      sku: skuNorm,
      cantidad_pickeada: Number(nuevoPickeado[0].total),
      cantidad_pendiente: linea.cantidad - Number(nuevoPickeado[0].total),
    };
  });
}

async function completarPicking(uuid, usuarioId) {
  return withTransaction(async (conn) => {
    const [paRows] = await conn.execute(
      `SELECT pa.*, p.id AS pedido_id FROM pedidos_almacen pa
        JOIN pedidos p ON p.id = pa.pedido_id
       WHERE pa.uuid = ? FOR UPDATE`,
      [uuid],
    );
    const pa = paRows[0];
    if (!pa) return null;

    const [lineas] = await conn.execute(
      `SELECT pl.id, pl.cantidad FROM pedido_lineas pl WHERE pl.pedido_id = ?`,
      [pa.pedido_id],
    );
    for (const ln of lineas) {
      const [pRows] = await conn.execute(
        `SELECT COALESCE(SUM(cantidad), 0) AS t FROM picking_lineas
          WHERE pedido_almacen_id = ? AND pedido_linea_id = ?`,
        [pa.id, ln.id],
      );
      if (Number(pRows[0].t) < ln.cantidad) {
        throw new Error('Aún hay líneas sin completar el picking.');
      }
    }

    await conn.execute(
      `UPDATE pedidos_almacen
          SET estado = 'empacado',
              picking_completado_en = COALESCE(picking_completado_en, NOW()),
              asignado_a = COALESCE(asignado_a, ?)
        WHERE id = ?`,
      [usuarioId, pa.id],
    );
    return { uuid, estado: 'empacado', picking_completo: true };
  });
}

module.exports = {
  listarUbicaciones,
  crearUbicacion,
  stockPorSku,
  sugerirUbicaciones,
  obtenerEstadoPicking,
  iniciarPicking,
  registrarPick,
  completarPicking,
};
