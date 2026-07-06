'use strict';

const repo = require('../repositories/personas.repository');
const mailSvc = require('./mail.service');
const { env } = require('../config/env');

const EVENTO_LABEL = {
  task: 'Tarea',
  lead: 'Lead / proyecto',
  lead_vinculo: 'OT / vínculo',
  ticket: 'Ticket Desk',
  reunion: 'Reunión',
};

const ROL_LABEL = {
  asignado: 'Asignado',
  etiquetado: 'Etiquetado',
  contratista_levantamiento: 'Contratista levantamiento',
  receptor_cotizacion: 'Receptor cotización',
  observador: 'Observador',
};

function urlEvento(tipo, ref) {
  const base = env.NEXUS_PUBLIC_URL || 'http://localhost:3000';
  switch (tipo) {
    case 'task':
      return `${base}/tasks.html`;
    case 'lead':
    case 'lead_vinculo':
      return `${base}/leads.html`;
    case 'ticket':
      return `${base}/desk.html`;
    default:
      return base;
  }
}

async function buscar(q, tipo) {
  return repo.buscarPersonas({ q, tipo });
}

async function crear(body, usuario) {
  if (!body.nombre_completo?.trim()) throw new Error('Nombre requerido.');
  const persona = await repo.crearPersona(body, usuario.id);
  if (persona.acceso_portal && persona.acceso_portal !== 'ninguno' && persona.email) {
    const inviteSvc = require('./portal-invite.service');
    void inviteSvc.provisionarDesdePersona(persona, usuario).catch((err) => {
      console.warn('[PORTAL] invitación persona:', err.message);
    });
  }
  return persona;
}

async function detalle(uuid) {
  return repo.obtenerPersona(uuid);
}

async function actualizar(uuid, body, usuarioActor) {
  const ok = await repo.actualizarPersona(uuid, body);
  if (!ok) return null;
  const persona = await repo.obtenerPersona(uuid);
  if (
    persona &&
    persona.acceso_portal &&
    persona.acceso_portal !== 'ninguno' &&
    persona.email &&
    (body.acceso_portal || body.email)
  ) {
    const inviteSvc = require('./portal-invite.service');
    void inviteSvc.provisionarDesdePersona(persona, usuarioActor).catch((err) => {
      console.warn('[PORTAL] invitación persona:', err.message);
    });
  }
  return persona;
}

async function listarEvento(tipo, ref) {
  if (!repo.EVENTO_TIPOS.includes(tipo)) throw new Error('Tipo de evento inválido.');
  return repo.listarPorEvento(tipo, ref);
}

async function etiquetar(tipo, ref, body, usuario) {
  if (!repo.EVENTO_TIPOS.includes(tipo)) throw new Error('Tipo de evento inválido.');
  if (!body.persona_uuid) throw new Error('persona_uuid requerido.');
  const rol = body.rol_participacion || 'etiquetado';
  if (!repo.ROLES.includes(rol)) throw new Error('Rol inválido.');

  const participante = await repo.etiquetarEnEvento(
    {
      persona_uuid: body.persona_uuid,
      evento_tipo: tipo,
      evento_ref: ref,
      rol_participacion: rol,
      notificar: body.notificar !== false,
      mensaje: body.mensaje,
    },
    usuario.id,
  );

  if (participante?.notificar && participante.email) {
    void notificarParticipante(participante, usuario).catch((err) => {
      console.warn('[PERSONAS] Notificación:', err.message);
    });
  }

  return participante;
}

async function quitar(vinculoUuid) {
  return repo.quitarEtiqueta(vinculoUuid);
}

async function notificarParticipante(participante, usuarioActor) {
  const persona = await repo.obtenerPersona(participante.persona_uuid);
  if (!persona?.email) {
    await repo.registrarNotificacion({
      persona_id: await repo.resolverPersonaId(participante.persona_uuid),
      evento_tipo: participante.evento_tipo,
      evento_ref: participante.evento_ref,
      estado: 'fallida',
      asunto: 'Sin correo',
      cuerpo: '',
      error_msg: 'La persona no tiene email.',
    });
    return { ok: false, reason: 'Sin email' };
  }

  const evento = EVENTO_LABEL[participante.evento_tipo] || participante.evento_tipo;
  const rol = ROL_LABEL[participante.rol_participacion] || participante.rol_participacion;
  const link = urlEvento(participante.evento_tipo, participante.evento_ref);
  const base = env.NEXUS_PUBLIC_URL || 'http://localhost:3000';
  const asunto = `[Nexus] Te enlazaron a ${evento} — ${rol}`;
  const cuerpo = [
    `Hola ${persona.nombre_completo},`,
    ``,
    `${usuarioActor?.nombre || 'Equipo ADESA'} te enlazó a un evento en Nexus.`,
    ``,
    `Evento: ${evento}`,
    `Rol: ${rol}`,
    participante.mensaje ? `Mensaje: ${participante.mensaje}` : '',
    ``,
    `Acceder: ${link}`,
    persona.acceso_portal && persona.acceso_portal !== 'ninguno'
      ? `Portal de soporte: ${base}/portal.html`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const personaId = await repo.resolverPersonaId(participante.persona_uuid);
  const division = persona.division === 'deportes' ? 'deportes' : 'energia';

  const mail = await mailSvc.enviar({
    division,
    to: persona.email,
    subject: asunto,
    text: cuerpo,
  });

  await repo.registrarNotificacion({
    persona_id: personaId,
    evento_tipo: participante.evento_tipo,
    evento_ref: participante.evento_ref,
    estado: mail.ok ? 'enviada' : mail.skipped ? 'pendiente' : 'fallida',
    asunto,
    cuerpo,
    error_msg: mail.error || mail.reason || null,
  });

  if (mail.ok) {
    await repo.marcarNotificado(participante.uuid);
  }

  return mail;
}

/** Sincroniza persona de directorio para un usuario Nexus interno (lazy). */
async function asegurarPersonaDeUsuario(usuarioRow) {
  if (!usuarioRow?.id) return null;
  const existente = await repo.buscarPersonas({ q: usuarioRow.email });
  const hit = existente.find((p) => p.usuario_uuid === usuarioRow.uuid);
  if (hit) return hit;

  return repo.crearPersona(
    {
      tipo: 'empleado_interno',
      nombre_completo: usuarioRow.nombre_completo,
      email: usuarioRow.email,
      division: usuarioRow.division || 'interno',
      usuario_id: usuarioRow.id,
      acceso_portal: 'permanente',
    },
    usuarioRow.id,
  );
}

module.exports = {
  buscar,
  crear,
  detalle,
  actualizar,
  listarEvento,
  etiquetar,
  quitar,
  notificarParticipante,
  asegurarPersonaDeUsuario,
  EVENTO_LABEL,
  ROL_LABEL,
};
