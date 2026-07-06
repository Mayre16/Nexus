'use strict';

const portalRepo = require('../repositories/portal.repository');
const ticketsRepo = require('../repositories/tickets.repository');
const kbRepo = require('../repositories/kb.repository');
const foroRepo = require('../repositories/foro.repository');
const mailSvc = require('./mail.service');
const { plantillaTicketActualizado, baseUrl } = require('../utils/desk-mail.template');
const { query } = require('../config/database');
const { env } = require('../config/env');

const ESTADOS_LABEL = {
  abierto: 'Abierto',
  en_proceso: 'En proceso',
  en_espera: 'En espera',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

function esCliente(usuario) {
  return portalRepo.ROLES_CLIENTE.includes(usuario.rol);
}

function requiereClienteEmpresa(usuario) {
  if (!usuario.cliente_empresa_id) {
    throw new Error('Tu cuenta no está vinculada a una empresa cliente. Contacta a soporte.');
  }
  return usuario.cliente_empresa_id;
}

function formatoTicket(t) {
  if (!t) return null;
  const pref = t.division === 'deportes' ? 'D' : 'E';
  return { ...t, referencia: `#${pref}${t.numero}` };
}

async function perfil(usuario) {
  const cliente = await portalRepo.obtenerClienteEmpresa(usuario.cliente_empresa_id);
  return {
    usuario: {
      uuid: usuario.uuid,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      division: usuario.division,
    },
    cliente: cliente
      ? { uuid: cliente.uuid, razon_social: cliente.razon_social, division: cliente.division }
      : null,
  };
}

async function listarTickets(usuario, filtros) {
  const cid = requiereClienteEmpresa(usuario);
  const tickets = await portalRepo.listarTicketsCliente(cid, filtros);
  const conteos = await portalRepo.contarTicketsCliente(cid);
  return {
    tickets: tickets.map(formatoTicket),
    conteos: Object.fromEntries(conteos.map((c) => [c.estado, c.total])),
  };
}

async function detalleTicket(uuid, usuario) {
  const cid = requiereClienteEmpresa(usuario);
  const ticket = await portalRepo.ticketPerteneceCliente(uuid, cid);
  if (!ticket) return null;
  const seguimientos = await portalRepo.listarSeguimientosCliente(ticket.id);
  let asignadoNombre = null;
  if (ticket.asignado_a) {
    const a = await query(`SELECT nombre_completo FROM usuarios WHERE id = ?`, [ticket.asignado_a]);
    asignadoNombre = a[0]?.nombre_completo || null;
  }
  return {
    ticket: formatoTicket({ ...ticket, asignado_nombre: asignadoNombre }),
    seguimientos,
  };
}

async function crearTicket(body, usuario) {
  const cid = requiereClienteEmpresa(usuario);
  const cliente = await portalRepo.obtenerClienteEmpresa(cid);
  const division = cliente?.division || usuario.division || 'energia';

  const creado = await ticketsRepo.crearTicket(
    {
      division,
      asunto: body.asunto,
      descripcion: body.descripcion,
      prioridad: body.prioridad || 'media',
      canal: 'portal',
      cliente_empresa_id: cid,
      email_remitente: usuario.email,
    },
    usuario.id,
  );

  const det = await detalleTicket(creado.uuid, usuario);
  if (det?.ticket) {
    void mailSvc.notificarTicketCreado(det.ticket, usuario).catch(() => {});
  }
  return det;
}

async function responderTicket(uuid, body, usuario) {
  const cid = requiereClienteEmpresa(usuario);
  const ticket = await portalRepo.ticketPerteneceCliente(uuid, cid);
  if (!ticket) return null;
  if (['cerrado'].includes(ticket.estado)) {
    throw new Error('Este ticket está cerrado.');
  }

  await ticketsRepo.agregarSeguimiento(ticket.id, {
    autorId: usuario.id,
    tipo: 'respuesta_cliente',
    contenido: body.contenido,
  });

  if (ticket.estado === 'resuelto') {
    await ticketsRepo.actualizarTicket(uuid, { estado: 'abierto' });
  } else if (ticket.estado === 'en_espera') {
    await ticketsRepo.actualizarTicket(uuid, { estado: 'en_proceso' });
  }

  return detalleTicket(uuid, usuario);
}

async function calificarTicket(uuid, valor, usuario) {
  const cid = requiereClienteEmpresa(usuario);
  const v = Math.min(5, Math.max(1, parseInt(valor, 10)));
  if (!v) throw new Error('Valoración inválida.');
  const ok = await portalRepo.registrarSatisfaccion(uuid, cid, v);
  if (!ok) throw new Error('No se pudo registrar la valoración.');
  return { ok: true, satisfaccion: v };
}

async function notificarClienteTicket(ticket, { estado, mensaje }) {
  const emails = new Set();
  if (ticket.email_remitente) emails.add(ticket.email_remitente);
  if (ticket.cliente_email) emails.add(ticket.cliente_email);
  if (!emails.size && ticket.cliente_empresa_id) {
    const c = await portalRepo.obtenerClienteEmpresa(ticket.cliente_empresa_id);
    if (c?.email_contacto) emails.add(c.email_contacto);
  }
  if (!emails.size) return { ok: false, skipped: true };

  const pref = ticket.division === 'deportes' ? 'D' : 'E';
  const referencia = `#${pref}${ticket.numero}`;
  const tpl = plantillaTicketActualizado({
    referencia,
    asunto: ticket.asunto,
    estado: estado ? ESTADOS_LABEL[estado] || estado : null,
    mensaje,
    enlacePortal: `${baseUrl()}/portal.html`,
    nombreCliente: ticket.cliente_nombre,
  });

  const buzon = ticket.division === 'deportes' ? env.DESK_MAIL_DEPORTES : env.DESK_MAIL_ENERGIA;

  return mailSvc.enviar({
    division: ticket.division || 'energia',
    to: [...emails].join(', '),
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    replyTo: buzon,
  });
}

async function listarKb(division, buscar) {
  return kbRepo.listarPublicos(division, buscar);
}

async function detalleKb(uuid) {
  return kbRepo.obtenerPublico(uuid);
}

async function listarForoCategorias(division) {
  return foroRepo.listarCategorias(division);
}

async function listarForoTemas(categoriaUuid) {
  return foroRepo.listarTemas(categoriaUuid);
}

async function detalleForoTema(uuid) {
  const tema = await foroRepo.obtenerTema(uuid);
  if (!tema) return null;
  const posts = await foroRepo.listarPosts(uuid);
  return { tema, posts };
}

async function crearForoTema(body, usuario) {
  return foroRepo.crearTema({
    categoriaUuid: body.categoria_uuid,
    titulo: body.titulo,
    autorId: usuario.id,
    autorNombre: usuario.nombre,
  });
}

async function crearForoPost(temaUuid, body, usuario) {
  return foroRepo.crearPost({
    temaUuid,
    contenido: body.contenido,
    autorId: usuario.id,
    autorNombre: usuario.nombre,
  });
}

module.exports = {
  esCliente,
  perfil,
  listarTickets,
  detalleTicket,
  crearTicket,
  responderTicket,
  calificarTicket,
  notificarClienteTicket,
  listarKb,
  detalleKb,
  listarForoCategorias,
  listarForoTemas,
  detalleForoTema,
  crearForoTema,
  crearForoPost,
  ESTADOS_LABEL,
};
