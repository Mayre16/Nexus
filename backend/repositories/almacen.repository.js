'use strict';

const { query, withTransaction } = require('../config/database');

const ESTADOS_ALMACEN = ['pendiente', 'picking', 'empacado', 'listo_envio', 'enviado', 'cancelado'];

function filtrosDivision(usuario, divisionQuery) {
  const DIVISIONES = ['energia', 'deportes'];
  if (usuario.rol === 'admin' || usuario.division === 'ambas') {
    if (divisionQuery && DIVISIONES.includes(divisionQuery)) return divisionQuery;
    return null;
  }
  return usuario.division === 'deportes' ? 'deportes' : 'energia';
}

async function listarCola(filtros, usuario) {
  const division = filtrosDivision(usuario, filtros.division);
  const params = [];
  let sql = `
    SELECT pa.uuid, pa.estado AS almacen_estado, pa.actualizado_en,
           p.uuid AS pedido_uuid, p.numero, p.division, p.estado AS pedido_estado, p.total, p.moneda,
           p.adm_pedido_id, c.razon_social AS cliente_nombre,
           ua.nombre_completo AS asignado_nombre, a.nombre AS almacen_nombre
      FROM pedidos_almacen pa
      JOIN pedidos p ON p.id = pa.pedido_id
      JOIN almacenes a ON a.id = pa.almacen_id
      LEFT JOIN clientes_empresa c ON c.id = p.cliente_empresa_id
      LEFT JOIN usuarios ua ON ua.id = pa.asignado_a
     WHERE p.estado NOT IN ('cancelado')`;
  if (division) {
    sql += ' AND p.division = ?';
    params.push(division);
  }
  if (filtros.estado && ESTADOS_ALMACEN.includes(filtros.estado)) {
    sql += ' AND pa.estado = ?';
    params.push(filtros.estado);
  } else if (!filtros.incluirEnviados) {
    sql += " AND pa.estado NOT IN ('enviado', 'cancelado')";
  }
  sql += ' ORDER BY pa.actualizado_en ASC LIMIT 100';
  const rows = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    referencia: `#P${r.division === 'deportes' ? 'D' : 'E'}${r.numero}`,
  }));
}

async function obtenerDetalle(uuid) {
  const rows = await query(
    `SELECT pa.*, p.uuid AS pedido_uuid, p.numero, p.division, p.estado AS pedido_estado,
            p.total, p.adm_pedido_id, c.razon_social AS cliente_nombre
       FROM pedidos_almacen pa
       JOIN pedidos p ON p.id = pa.pedido_id
       LEFT JOIN clientes_empresa c ON c.id = p.cliente_empresa_id
      WHERE pa.uuid = ? LIMIT 1`,
    [uuid]
  );
  if (!rows[0]) return null;
  const lineas = await query(
    `SELECT pl.id, pl.sku, pl.descripcion, pl.cantidad, pl.precio_unitario, pl.producto_id
       FROM pedido_lineas pl WHERE pl.pedido_id = ?`,
    [rows[0].pedido_id]
  );
  const r = rows[0];
  return {
    ...r,
    referencia: `#P${r.division === 'deportes' ? 'D' : 'E'}${r.numero}`,
    lineas,
  };
}

async function actualizarEstado(uuid, estado, usuarioId, notas) {
  if (!ESTADOS_ALMACEN.includes(estado)) throw new Error('Estado de almacén inválido.');

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT pa.*, p.id AS pedido_id, p.numero, p.estado AS pedido_estado
         FROM pedidos_almacen pa
         JOIN pedidos p ON p.id = pa.pedido_id
        WHERE pa.uuid = ? FOR UPDATE`,
      [uuid]
    );
    const row = rows[0];
    if (!row) return null;

    await conn.execute(
      `UPDATE pedidos_almacen SET estado = ?, notas = COALESCE(?, notas), asignado_a = COALESCE(asignado_a, ?)
       WHERE id = ?`,
      [estado, notas || null, usuarioId, row.id]
    );

    if (estado === 'enviado' && row.pedido_estado !== 'enviado') {
      const [lineas] = await conn.execute(
        `SELECT pl.*, pr.id AS prod_id FROM pedido_lineas pl
         JOIN productos pr ON pr.id = pl.producto_id WHERE pl.pedido_id = ?`,
        [row.pedido_id]
      );
      for (const ln of lineas) {
        await conn.execute(
          `UPDATE productos SET stock_disponible = stock_disponible - ?, stock_reservado = stock_reservado - ?
           WHERE id = ?`,
          [ln.cantidad, ln.cantidad, ln.prod_id]
        );
        await conn.execute(
          `INSERT INTO movimientos_inventario (producto_id, almacen_id, tipo, cantidad, pedido_id, referencia)
           VALUES (?, ?, 'salida', ?, ?, ?)`,
          [ln.prod_id, row.almacen_id, -ln.cantidad, row.pedido_id, `Envío pedido #${row.numero}`]
        );
      }
      await conn.execute(`UPDATE pedidos SET estado = 'enviado' WHERE id = ?`, [row.pedido_id]);
    }

    return { uuid, estado };
  });
}

module.exports = { ESTADOS_ALMACEN, listarCola, obtenerDetalle, actualizarEstado };
