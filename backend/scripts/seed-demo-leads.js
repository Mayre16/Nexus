'use strict';

/**
 * Demo Leads + iERP + ticket Desk
 * node scripts/seed-demo-leads.js [email] [password]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../config/.env') });

const BASE = process.env.NEXUS_PUBLIC_URL || 'http://127.0.0.1:3000';
const API_KEY = process.env.IERP_NEXUS_API_KEY || 'nexus_ierp_dev_key_local';
const ADMIN_EMAIL = process.argv[2] || 'martha@adesa.com.do';
const ADMIN_PASS = process.argv[3] || 'AdesaNexus2026!';

const DEMO = {
  ierp_tenant_id: 'demo-tenant-adesa',
  ierp_quote_id: 'demo-quote-2026-001',
  ierp_quote_number: 'COT-DEMO-2026-001',
  ierp_company_name: 'Cliente Demo Solar ADESA',
  contact_name: 'Carlos Méndez',
  email: 'carlos.mendez@demo.local',
  phone: '809-555-0100',
  total: 285000,
  currency: 'DOP',
  division: 'energia',
};

function log(icon, msg) {
  console.log(`${icon} ${msg}`);
}

async function jsonFetch(url, opts = {}) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

async function getSession() {
  let jar = [];
  function merge(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const legacy = res.headers.get('set-cookie');
    const all = list.length ? list : legacy ? [legacy] : [];
    for (const c of all) {
      const part = c.split(';')[0];
      const name = part.split('=')[0];
      jar = jar.filter((x) => !x.startsWith(`${name}=`));
      jar.push(part);
    }
  }
  const cookie = () => jar.join('; ');

  merge(await fetch(`${BASE}/api/health`));
  const csrf = jar.find((c) => c.startsWith('nexus_csrf='))?.split('=')[1] || '';

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': decodeURIComponent(csrf),
      Cookie: cookie(),
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  merge(loginRes);
  const loginJson = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    throw new Error(
      `Login falló (${ADMIN_EMAIL}): ${loginJson.error || loginRes.status}. Ejecuta: node scripts/seed-admin.js`,
    );
  }
  const csrf2 = jar.find((c) => c.startsWith('nexus_csrf='))?.split('=')[1] || csrf;
  return {
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': decodeURIComponent(csrf2),
      Cookie: cookie(),
    },
  };
}

async function main() {
  log('→', `Nexus ${BASE}`);

  const leadRes = await jsonFetch(`${BASE}/api/office/leads/from-ierp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Ierp-Key': API_KEY },
    body: JSON.stringify({ follow_up: true, ...DEMO }),
  });
  if (!leadRes.ok) throw new Error(`from-ierp: ${leadRes.status} ${JSON.stringify(leadRes.json)}`);

  const leadUuid = leadRes.json.lead?.uuid;
  log('✔', `Lead: ${leadRes.json.lead?.referencia} (${leadUuid})`);

  const { headers: authHeaders } = await getSession();
  log('✔', `Sesión: ${ADMIN_EMAIL}`);

  const otRes = await jsonFetch(`${BASE}/api/office/leads/${leadUuid}/vinculos`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      tipo: 'ot_levantamiento',
      titulo: 'Levantamiento sitio — Demo Solar',
      descripcion: 'Visita técnica inicial',
      assignee_name: 'Técnico Demo',
      assignee_source: 'ierp_employee',
      fecha_limite: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    }),
  });
  if (!otRes.ok) throw new Error(`OT: ${JSON.stringify(otRes.json)}`);
  log('✔', `OT: ${otRes.json.titulo}`);

  const ticketRes = await jsonFetch(`${BASE}/api/office/leads/${leadUuid}/tickets`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      titulo: 'Coordinación instalación demo',
      asunto: '[Lead] Coordinación instalación demo',
      descripcion: 'Ticket generado por seed demo',
    }),
  });
  if (!ticketRes.ok) throw new Error(`Ticket: ${JSON.stringify(ticketRes.json)}`);
  log('✔', `Ticket Desk: ${ticketRes.json.ticket?.referencia}`);

  const cfgRes = await jsonFetch(`${BASE}/api/settings`, { headers: authHeaders });
  if (cfgRes.ok) {
    const smtp = cfgRes.json.smtp_status?.energia;
    log(smtp?.configured ? '✔' : '⚠', `SMTP: ${smtp?.configured ? 'OK' : 'sin contraseña — /settings.html'}`);
  }

  const det = await jsonFetch(`${BASE}/api/office/leads/${leadUuid}`, { headers: authHeaders });
  log('✔', `${det.json.vinculos?.length || 0} vínculos · ${det.json.pendientes_count} pendientes`);

  console.log('\n--- Abrir ---');
  console.log(`Leads:  ${BASE}/leads.html#${leadUuid}`);
  console.log(`Desk:   ${BASE}/desk.html`);
  console.log(`Config: ${BASE}/settings.html`);
}

main().catch((e) => {
  console.error('✖', e.message);
  process.exit(1);
});
