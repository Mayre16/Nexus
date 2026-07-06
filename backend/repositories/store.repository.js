'use strict';

const crypto = require('crypto');
const { query, pool, withTransaction } = require('../config/database');
const adm = require('../services/adm.service');

const DIVISIONES = ['energia', 'deportes'];
const ESTADOS_PEDIDO = ['borrador', 'pendiente_pago', 'pagado', 'en_almacen', 'enviado', 'entregado', 'cancelado'];

function secuenciaPedido(division) {
  return division === 'deportes' ? 'pedido_deportes' : 'pedido_energia';
}

async function siguienteNumero(conn, nombre) {
  await conn.execute(`UPDATE secuencias SET valor = LAST_INSERT_ID(valor + 1) WHERE nombre = ?`, [nombre]);
  const [rows] = await conn.execute(`SELECT LAST_INSERT_ID() AS n`);
  return rows[0].n;
}

function filtrosDivision(usuario, divisionQuery) {
  if (usuario.rol === 'admin' || usuario.division === 'ambas') {
    if (divisionQuery && DIVISIONES.includes(divisionQuery)) return divisionQuery;
    return null;
  }
  return usuario.division === 'deportes' ? 'deportes' : 'energia';
}

async function listarProductos(division) {
  const params = [];
  let sql = `SELECT uuid, sku, codigo_adm, nombre, descripcion, division, precio, moneda,
                    stock_disponible, stock_reservado, unidad, categoria
               FROM productos WHERE activo = 1`;
  if (division) {
    sql += ' AND division = ?';
    params.push(division);
  }
  sql += ' ORDER BY nombre';
  return query(sql, params);
}

async function obtenerProductoPorUuid(uuid) {
  const rows = await query(`SELECT * FROM productos WHERE uuid = ? AND activo = 1 LIMIT 1`, [uuid]);
  return rows[0] || null;
}

async function listarPedidos(filtros, usuario) {
  const division = filtrosDivision(usuario, filtros.division);
  const params = [];
  let sql = `
    SELECT p.uuid, p.numero, p.division, p.estado, p.canal, p.subtotal, p.total, p.moneda,
           p.adm_pedido_id, p.creado_en, c.razon_social AS cliente_nombre,
           pa.estado AS almacen_estado
      FROM pedidos p
      LEFT JOIN clientes_empresa c ON c.id = p.cliente_empresa_id
      LEFT JOIN pedidos_almacen pa ON pa.pedido_id = p.id
     WHERE 1=1`;
  if (division) {
    sql += ' AND p.division = ?';
    params.push(division);
  }
  if (filtros.estado && ESTADOS_PEDIDO.includes(filtros.estado)) {
    sql += ' AND p.estado = ?';
    params.push(filtros.estado);
  }
  sql += ' ORDER BY p.creado_en DESC LIMIT 100';
  const rows = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    referencia: `#P${r.division === 'deportes' ? 'D' : 'E'}${r.numero}`,
  }));
}

async function obtenerPedido(uuid) {
  const rows = await query(
    `SELECT p.*, c.razon_social AS cliente_nombre
       FROM pedidos p
       LEFT JOIN clientes_empresa c ON c.id = p.cliente_empresa_id
      WHERE p.uuid = ? LIMIT 1`,
    [uuid]
  );
  if (!rows[0]) return null;
  const lineas = await query(
    `SELECT pl.id, pl.sku, pl.descripcion, pl.cantidad, pl.precio_unitario, pl.subtotal, p2.nombre AS producto_nombre
       FROM pedido_lineas pl
       LEFT JOIN productos p2 ON p2.id = pl.producto_id
      WHERE pl.pedido_id = ?`,
    [rows[0].id]
  );
  const p = rows[0];
  return {
    ...p,
    referencia: `#P${p.division === 'deportes' ? 'D' : 'E'}${p.numero}`,
    lineas,
  };
}

async function crearPedido({ division, lineas, clienteEmpresaId, notas, creadoPor, canal }) {
  const uuid = crypto.randomUUID();
  return withTransaction(async (conn) => {
    const numero = await siguienteNumero(conn, secuenciaPedido(division));
    let subtotal = 0;

    for (const linea of lineas) {
      const [prods] = await conn.execute(`SELECT * FROM productos WHERE uuid = ? FOR UPDATE`, [linea.producto_uuid]);
      const prod = prods[0];
      if (!prod) throw new Error(`Producto no encontrado: ${linea.producto_uuid}`);
      const disp = prod.stock_disponible - prod.stock_reservado;
      if (disp < linea.cantidad) throw new Error(`Stock insuficiente para ${prod.sku}`);
      subtotal += linea.cantidad * Number(prod.precio);
    }

    const impuestos = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + impuestos;

    const [ins] = await conn.execute(
      `INSERT INTO pedidos (uuid, numero, division, cliente_empresa_id, estado, canal, subtotal, impuestos, total, notas, creado_por)
       VALUES (?, ?, ?, ?, 'en_almacen', ?, ?, ?, ?, ?, ?)`,
      [uuid, numero, division, clienteEmpresaId || null, canal || 'web', subtotal, impuestos, total, notas || null, creadoPor]
    );
    const pedidoId = ins.insertId;

    for (const linea of lineas) {
      const [prods] = await conn.execute(`SELECT * FROM productos WHERE uuid = ? FOR UPDATE`, [linea.producto_uuid]);
      const prod = prods[0];
      const lineSub = linea.cantidad * Number(prod.precio);
      await conn.execute(
        `INSERT INTO pedido_lineas (pedido_id, producto_id, sku, descripcion, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pedidoId, prod.id, prod.sku, prod.nombre, linea.cantidad, prod.precio, lineSub]
      );
      await conn.execute(
        `UPDATE productos SET stock_reservado = stock_reservado + ? WHERE id = ?`,
        [linea.cantidad, prod.id]
      );
      await conn.execute(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, pedido_id, referencia)
         VALUES (?, 'reserva', ?, ?, ?)`,
        [prod.id, linea.cantidad, pedidoId, `Pedido #${numero}`]
      );
    }

    const [alms] = await conn.execute(`SELECT id FROM almacenes WHERE activo = 1 ORDER BY id LIMIT 1`);
    if (alms[0]) {
      await conn.execute(
        `INSERT INTO pedidos_almacen (uuid, pedido_id, almacen_id, estado)
         VALUES (?, ?, ?, 'pendiente')`,
        [crypto.randomUUID(), pedidoId, alms[0].id]
      );
    }

    const admId = await adm.enviarPedidoAdm({ division, numero });
    if (admId) {
      await conn.execute(`UPDATE pedidos SET adm_pedido_id = ? WHERE id = ?`, [admId, pedidoId]);
    }

    return { id: pedidoId, uuid, numero, division, total };
  });
}

module.exports = {
  DIVISIONES,
  ESTADOS_PEDIDO,
  filtrosDivision,
  listarProductos,
  obtenerProductoPorUuid,
  listarPedidos,
  obtenerPedido,
  crearPedido,
};
