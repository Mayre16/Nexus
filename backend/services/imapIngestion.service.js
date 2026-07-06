'use strict';

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { env } = require('../config/env');
const repo = require('../repositories/tickets.repository');
const { buzonDivision, buzonConfigurado, imapForDivision, DIVISIONES } = require('./deskMailConfig');

const MAX_CORREOS_POR_POLL = 20;

/** Extrae #1024, #E1024 o #D1024 del asunto/cuerpo. */
function parsearReferenciaTicket(texto, divisionDefecto) {
  const m = String(texto || '').match(/#([ED])?(\d{3,6})/i);
  if (!m) return null;
  const pref = (m[1] || '').toUpperCase();
  const numero = parseInt(m[2], 10);
  let division = divisionDefecto;
  if (pref === 'D') division = 'deportes';
  if (pref === 'E') division = 'energia';
  return { numero, division };
}

function limpiarAsunto(asunto) {
  return String(asunto || 'Sin asunto')
    .replace(/^(re:\s*|fwd:\s*)+/gi, '')
    .trim()
    .slice(0, 255);
}

async function procesarMensaje(division, parsed) {
  const messageId = parsed.messageId;
  if (messageId && (await repo.existeMessageId(messageId))) {
    return { accion: 'duplicado', messageId };
  }

  const remitente = parsed.from?.value?.[0]?.address || null;
  const asunto = limpiarAsunto(parsed.subject);
  const cuerpo = parsed.text || parsed.html || asunto;
  const ref = parsearReferenciaTicket(`${parsed.subject}\n${cuerpo}`, division);

  if (ref) {
    const ticket = await repo.obtenerPorNumeroDivision(ref.numero, ref.division);
    if (ticket) {
      await repo.agregarSeguimiento(ticket.id, {
        tipo: 'correo_entrante',
        contenido: cuerpo.slice(0, 65000),
        emailMessageId: messageId,
      });
      return { accion: 'seguimiento', ticket: ref.numero, division: ref.division };
    }
  }

  const cliente = await repo.buscarClientePorEmail(remitente, division);
  const creado = await repo.crearTicketDesdeCorreo({
    division,
    asunto,
    descripcion: cuerpo.slice(0, 65000),
    email_message_id: messageId,
    email_remitente: remitente,
    cliente_empresa_id: cliente?.id || null,
  });

  if (remitente) {
    const mailSvc = require('./mail.service');
    const ticketsRepo = require('../repositories/tickets.repository');
    const ticket = await ticketsRepo.obtenerPorUuid(creado.uuid);
    if (ticket) {
      void mailSvc.notificarTicketCreado(ticket, null).catch((err) => {
        console.warn('[DESK] autorespuesta IMAP:', err.message);
      });
    }
  }

  return { accion: 'nuevo', ticket: creado.numero, division, uuid: creado.uuid };
}

async function pollBuzon(division) {
  const buzon = buzonDivision(division);
  if (!buzonConfigurado(buzon, division)) {
    return { division, ok: false, mensaje: `Buzón ${division} no configurado (correo/contraseña IMAP).` };
  }

  const imap = imapForDivision(division);
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user: buzon.imapUser, pass: buzon.imapPassword },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  // Sin esto, ETIMEOUT en el socket tumba todo el proceso Node.
  client.on('error', (err) => {
    console.warn(`[DESK] IMAP ${division} error:`, err.message);
  });

  const resultados = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const unseen = await client.search({ seen: false });
      const uids = unseen.slice(-MAX_CORREOS_POR_POLL);
      for await (const msg of client.fetch(uids, { source: true, uid: true })) {
        try {
          const parsed = await simpleParser(msg.source);
          const r = await procesarMensaje(division, parsed);
          resultados.push(r);
          await client.messageFlagsAdd(msg.uid, ['\\Seen']);
        } catch (err) {
          resultados.push({ accion: 'error', mensaje: err.message });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch (_) {
      /* conexión ya caída */
    }
    try {
      client.close();
    } catch (_) {
      /* noop */
    }
  }

  return { division, ok: true, procesados: resultados.length, resultados };
}

async function pollTodosLosBuzones() {
  try {
    const configSvc = require('./config.service');
    const integ = await configSvc.getIntegrationsStatus();
    if (!integ.imap.enabled) {
      return [{ ok: false, mensaje: 'IMAP deshabilitado en configuración.' }];
    }
  } catch (_) {
    /* sin BD o config — usar env */
  }

  const out = [];
  for (const division of DIVISIONES) {
    if (division === 'deportes' && !buzonConfigurado(buzonDivision('deportes'), 'deportes')) {
      continue;
    }
    try {
      out.push(await pollBuzon(division));
    } catch (err) {
      out.push({ division, ok: false, mensaje: err.message });
    }
  }
  return out;
}

module.exports = { pollBuzon, pollTodosLosBuzones, parsearReferenciaTicket };
