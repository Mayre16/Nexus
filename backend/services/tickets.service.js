'use strict';

const repo = require('../repositories/tickets.repository');
const { listarBuzonesPublico } = require('./deskMailConfig');
const { query } = require('../config/database');

function puedeVerTicket(usuario, ticket) {
  if (!ticket) return false;
  if (usuario.rol === 'admin' || usuario.division === 'ambas') return true;
  return usuario.division === ticket.division;
}

function formatoTicket(t) {
  if (!t) return null;
  const pref = t.division === 'deportes' ? 'D' : 'E';
  return {
    ...t,
    referencia: `#${pref}${t.numero}`,
  };
}

async function listar(filtros, usuario) {
  const tickets = await repo.listarTickets(filtros, usuario);
  const conteos = await repo.contarPorEstado(usuario, filtros.division);
  return {
    tickets: tickets.map(formatoTicket),
    conteos: Object.fromEntries(conteos.map((c) => [c.estado, c.total])),
    buzones: listarBuzonesPublico(),
  };
}

async function detalle(uuid, usuario) {
  const ticket = await repo.obtenerPorUuid(uuid);
  if (!ticket || !puedeVerTicket(usuario, ticket)) return null;
  const seguimientos = await repo.listarSeguimientos(ticket.id);
  return {
    ticket: formatoTicket(ticket),
    seguimientos,
  };
}

async function crear(body, usuario) {
  const division = repo.filtrosDivision(usuario, body.division) || body.division || 'energia';
  if (!repo.DIVISIONES.includes(division)) {
    throw new Error('División inválida.');
  }
  if (usuario.rol !== 'admin' && usuario.division !== 'ambas' && usuario.division !== division) {
    throw new Error('No puedes crear tickets en esta división.');
  }

  let asignadoId = null;
  if (body.asignado_uuid) {
    const u = await query(`SELECT id FROM usuarios WHERE uuid = ? LIMIT 1`, [body.asignado_uuid]);
    asignadoId = u[0]?.id || null;
  }

  const creado = await repo.crearTicket(
    {
      division,
      asunto: body.asunto,
      descripcion: body.descripcion,
      prioridad: body.prioridad || 'media',
      canal: body.canal || 'web',
      email_remitente: body.email_remitente || null,
      asignado_a: asignadoId,
    },
    usuario.id
  );

  const det = await detalle(creado.uuid, usuario);
  if (det?.ticket) {
    const mailSvc = require('./mail.service');
    void mailSvc.notificarTicketCreado(det.ticket, usuario).then((r) => {
      if (!r.ok && !r.skipped) {
        console.warn('[DESK] mail ticket cliente:', r.cliente?.error || r.error);
        console.warn('[DESK] mail ticket soporte:', r.soporte?.error || r.error);
      }
    });
  }

  return det;
}

async function actualizar(uuid, body, usuario) {
  const ticket = await repo.obtenerPorUuid(uuid);
  if (!ticket || !puedeVerTicket(usuario, ticket)) return null;

  const campos = {};
  if (body.estado && repo.ESTADOS.includes(body.estado)) campos.estado = body.estado;
  if (body.prioridad && repo.PRIORIDADES.includes(body.prioridad)) campos.prioridad = body.prioridad;
  if (body.asunto) campos.asunto = body.asunto.slice(0, 255);
  if (body.descripcion !== undefined) campos.descripcion = body.descripcion;

  if (body.asignado_uuid !== undefined) {
    if (body.asignado_uuid === null || body.asignado_uuid === '') {
      campos.asignado_a = null;
    } else {
      const u = await query(`SELECT id FROM usuarios WHERE uuid = ? LIMIT 1`, [body.asignado_uuid]);
      campos.asignado_a = u[0]?.id || null;
    }
  }

  await repo.actualizarTicket(uuid, campos);
  const det = await detalle(uuid, usuario);
  if (det?.ticket && (campos.estado || campos.prioridad)) {
    const portalSvc = require('./portal.service');
    void portalSvc.notificarClienteTicket(det.ticket, {
      estado: campos.estado,
      mensaje: null,
    }).catch(() => {});
  }
  return det;
}

async function agregarNota(uuid, body, usuario) {
  const ticket = await repo.obtenerPorUuid(uuid);
  if (!ticket || !puedeVerTicket(usuario, ticket)) return null;

  const tipo = body.tipo && ['nota_interna', 'respuesta_cliente'].includes(body.tipo)
    ? body.tipo
    : 'nota_interna';

  await repo.agregarSeguimiento(ticket.id, {
    autorId: usuario.id,
    tipo,
    contenido: body.contenido,
  });

  if (body.estado && repo.ESTADOS.includes(body.estado)) {
    await repo.actualizarTicket(uuid, { estado: body.estado });
  }

  const det = await detalle(uuid, usuario);
  if (det?.ticket && tipo === 'respuesta_cliente') {
    const portalSvc = require('./portal.service');
    void portalSvc.notificarClienteTicket(det.ticket, {
      estado: body.estado || det.ticket.estado,
      mensaje: body.contenido,
    }).catch(() => {});
  }
  return det;
}

async function cerrar(uuid, body, usuario) {
  const ticket = await repo.obtenerPorUuid(uuid);
  if (!ticket || !puedeVerTicket(usuario, ticket)) return null;

  await repo.actualizarTicket(uuid, {
    estado: 'cerrado',
    informe_resolucion: body.informe_resolucion || body.informe || '',
    tiempo_invertido_min: Math.max(0, parseInt(body.tiempo_invertido_min, 10) || 0),
  });

  if (body.informe_resolucion || body.informe) {
    await repo.agregarSeguimiento(ticket.id, {
      autorId: usuario.id,
      tipo: 'sistema',
      contenido: `Ticket cerrado.\n\n${body.informe_resolucion || body.informe}`,
    });
  }

  const det = await detalle(uuid, usuario);
  if (det?.ticket) {
    const portalSvc = require('./portal.service');
    void portalSvc.notificarClienteTicket(det.ticket, {
      estado: 'cerrado',
      mensaje: body.informe_resolucion || body.informe || 'Tu solicitud ha sido cerrada.',
    }).catch(() => {});
  }
  return det;
}

async function listarAgentes() {
  return query(
    `SELECT uuid, nombre_completo, email, division, rol
       FROM usuarios
      WHERE activo = 1 AND rol IN ('admin','empleado')
      ORDER BY nombre_completo`
  );
}

async function listarClientes(division, usuario) {
  const div = repo.filtrosDivision(usuario, division);
  return repo.listarClientesEmpresa(div);
}

module.exports = {
  listar,
  detalle,
  crear,
  actualizar,
  agregarNota,
  cerrar,
  listarAgentes,
  listarClientes,
  listarBuzonesPublico,
};
