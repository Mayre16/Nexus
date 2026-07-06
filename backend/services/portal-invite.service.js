'use strict';

const { query } = require('../config/database');
const usuarioRepo = require('../repositories/usuario.repository');
const portalRepo = require('../repositories/portal.repository');
const mailSvc = require('./mail.service');
const { plantillaInvitacion, baseUrl } = require('../utils/portal-mail.template');
const { env } = require('../config/env');

async function invitarCliente(body, actor) {
  const email = String(body.email || '').toLowerCase().trim();
  if (!email) throw new Error('Correo requerido.');

  const nombre = (body.nombre_completo || body.nombre || email.split('@')[0]).trim();
  const rol = body.rol === 'cliente_suscriptor' ? 'cliente_suscriptor' : 'cliente_externo';
  const division = ['energia', 'deportes'].includes(body.division) ? body.division : 'energia';

  let usuario = await usuarioRepo.buscarPorEmail(email);
  let usuarioId;
  let usuarioUuid;

  if (usuario) {
    if (!portalRepo.ROLES_CLIENTE.includes(usuario.rol) && usuario.rol !== 'admin') {
      throw new Error('El correo ya pertenece a un usuario interno.');
    }
    usuarioId = usuario.id;
    usuarioUuid = usuario.uuid;
    if (body.cliente_empresa_uuid) {
      const c = await query(`SELECT id FROM clientes_empresa WHERE uuid = ? LIMIT 1`, [
        body.cliente_empresa_uuid,
      ]);
      if (c[0]) {
        await query(`UPDATE usuarios SET cliente_empresa_id = ?, rol = ?, division = ? WHERE id = ?`, [
          c[0].id,
          rol,
          division,
          usuarioId,
        ]);
      }
    }
    if (usuario.activo === 1 && !body.reenviar) {
      throw new Error('El usuario ya está activo. Use reenviar para nueva invitación.');
    }
  } else {
    const creado = await portalRepo.crearUsuarioCliente({
      email,
      nombre_completo: nombre,
      rol,
      division,
      cliente_empresa_uuid: body.cliente_empresa_uuid,
    });
    usuarioId = creado.id;
    usuarioUuid = creado.uuid;
  }

  if (body.persona_uuid) {
    await portalRepo.vincularPersonaUsuario(body.persona_uuid, usuarioId);
    await query(
      `UPDATE nexus_personas SET acceso_portal = ?, acceso_expira_en = ? WHERE uuid = ?`,
      [
        body.acceso_portal || 'permanente',
        body.acceso_expira_en || null,
        body.persona_uuid,
      ],
    );
  }

  const inv = await portalRepo.crearInvitacion({
    usuarioId,
    personaId: null,
    creadoPor: actor?.id,
    tipo: body.tipo || 'invitacion',
  });

  const enlace = `${baseUrl()}/activar.html?token=${inv.token}`;
  const tpl = plantillaInvitacion({
    nombre,
    email,
    enlaceActivar: enlace,
    portalNombre: body.portal_nombre || 'Soporte ADESA',
  });

  const mail = await mailSvc.enviar({
    division,
    to: email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
  });

  return {
    ok: true,
    usuario_uuid: usuarioUuid,
    invitacion_uuid: inv.uuid,
    expira_en: inv.expira_en,
    mail,
    enlace_dev: env.esProduccion ? undefined : enlace,
  };
}

async function provisionarDesdePersona(persona, actor) {
  if (!persona.email) return null;
  if (!persona.acceso_portal || persona.acceso_portal === 'ninguno') return null;
  if (persona.usuario_uuid) {
    return invitarCliente(
      {
        email: persona.email,
        nombre_completo: persona.nombre_completo,
        persona_uuid: persona.uuid,
        acceso_portal: persona.acceso_portal,
        acceso_expira_en: persona.acceso_expira_en,
        reenviar: true,
      },
      actor,
    );
  }
  return invitarCliente(
    {
      email: persona.email,
      nombre_completo: persona.nombre_completo,
      persona_uuid: persona.uuid,
      acceso_portal: persona.acceso_portal,
      acceso_expira_en: persona.acceso_expira_en,
      division: persona.division === 'deportes' ? 'deportes' : 'energia',
    },
    actor,
  );
}

module.exports = { invitarCliente, provisionarDesdePersona };
