'use strict';

const repo = require('../repositories/store.repository');
const adm = require('../services/adm.service');

async function listarProductos(usuario, divisionQuery) {
  const division = repo.filtrosDivision(usuario, divisionQuery);
  return repo.listarProductos(division);
}

async function listarPedidos(filtros, usuario) {
  return repo.listarPedidos(filtros, usuario);
}

async function detallePedido(uuid) {
  return repo.obtenerPedido(uuid);
}

async function crearPedido(body, usuario) {
  const division = body.division || (usuario.division === 'deportes' ? 'deportes' : 'energia');
  if (usuario.rol !== 'admin' && usuario.division !== 'ambas' && usuario.division !== division) {
    throw new Error('No puedes crear pedidos en otra división.');
  }
  if (!Array.isArray(body.lineas) || !body.lineas.length) {
    throw new Error('El pedido debe incluir al menos una línea.');
  }
  return repo.crearPedido({
    division,
    lineas: body.lineas,
    clienteEmpresaId: body.cliente_empresa_id || null,
    notas: body.notas,
    canal: body.canal || 'web',
    creadoPor: usuario.id,
  });
}

async function estadoAdm() {
  return adm.estadoAdm();
}

async function syncAdm(division) {
  return adm.sincronizarProductos(division);
}

module.exports = {
  listarProductos,
  listarPedidos,
  detallePedido,
  crearPedido,
  estadoAdm,
  syncAdm,
};
