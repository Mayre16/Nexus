'use strict';

/**
 * E2E: cotización iERP → auth → sync Leads → OT → borrador factura
 * node scripts/test-e2e-workflow.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../config/.env') });

const NEXUS = process.env.NEXUS_PUBLIC_URL || 'http://127.0.0.1:3000';
const IERP = (process.env.IERP_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const API_KEY = process.env.IERP_NEXUS_API_KEY || 'nexus_ierp_dev_key_local';
const NEXUS_USER = process.argv[2] || 'martha@adesa.com.do';
const NEXUS_PASS = process.argv[3] || 'AdesaNexus2026!';
const IERP_USER = process.argv[4] || 'admin@demo.local';
const IERP_PASS = process.argv[5] || 'DemoPass123!';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(step, msg, ok = true) {
  console.log(`${ok ? '✓' : '✗'} [${step}] ${msg}`);
}

async function ierpLogin() {
  const r = await fetch(`${IERP}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: IERP_USER, password: IERP_PASS }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`iERP login: ${j.message || r.status}`);
  return j.accessToken;
}

async function nexusSession() {
  let jar = [];
  const merge = (res) => {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const legacy = res.headers.get('set-cookie');
    const all = list.length ? list : legacy ? [legacy] : [];
    for (const c of all) {
      const part = c.split(';')[0];
      const name = part.split('=')[0];
      jar = jar.filter((x) => !x.startsWith(`${name}=`));
      jar.push(part);
    }
  };
  const cookie = () => jar.join('; ');
  merge(await fetch(`${NEXUS}/api/health`));
  const csrf = jar.find((c) => c.startsWith('nexus_csrf='))?.split('=')[1] || '';
  const loginRes = await fetch(`${NEXUS}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': decodeURIComponent(csrf),
      Cookie: cookie(),
    },
    body: JSON.stringify({ email: NEXUS_USER, password: NEXUS_PASS }),
  });
  merge(loginRes);
  const loginJson = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) throw new Error(`Nexus login: ${loginJson.error || loginRes.status}`);
  const csrf2 = jar.find((c) => c.startsWith('nexus_csrf='))?.split('=')[1] || csrf;
  return {
    headers: (extra = {}) => ({
      'Content-Type': 'application/json',
      'X-CSRF-Token': decodeURIComponent(csrf2),
      Cookie: cookie(),
      ...extra,
    }),
  };
}

async function main() {
  console.log('\n=== E2E Workflow Nexus + iERP ===\n');

  const ierpToken = await ierpLogin();
  log('1', 'Login iERP OK');
  const ierpH = { Authorization: `Bearer ${ierpToken}`, 'Content-Type': 'application/json' };

  const me = await fetch(`${IERP}/api/auth/me`, { headers: ierpH }).then((r) => r.json());
  const tenantId = me.tenantId;
  if (!tenantId) throw new Error('No se pudo obtener tenantId de iERP');
  log('1', `Tenant iERP: ${tenantId}`);

  const [companiesRes, productsRes, stagesRes] = await Promise.all([
    fetch(`${IERP}/api/crm/companies?page=1&limit=5`, { headers: ierpH }),
    fetch(`${IERP}/api/inventory/products?page=1&limit=5`, { headers: ierpH }),
    fetch(`${IERP}/api/crm/pipeline-stages`, { headers: ierpH }),
  ]);
  const companies = (await companiesRes.json()).data || [];
  const products = (await productsRes.json()).data || [];
  const stages = await stagesRes.json();
  if (!companies.length || !products.length) throw new Error('Seed iERP: falta company o product');
  const company = companies[0];
  const product = products[0];
  const stageId = Array.isArray(stages) && stages[0] ? stages[0].id : null;

  const quoteRes = await fetch(`${IERP}/api/sales/orders`, {
    method: 'POST',
    headers: ierpH,
    body: JSON.stringify({
      companyId: company.id,
      status: 'QUOTE',
      nexusLeadsFollowUp: true,
      pipelineStageId: stageId,
      notes: `E2E test ${new Date().toISOString()}`,
      lines: [
        {
          productId: product.id,
          quantity: 1,
          unitPrice: Number(product.salePrice) || 50000,
          taxRate: 18,
          description: 'Línea E2E',
        },
      ],
    }),
  });
  const quote = await quoteRes.json();
  if (!quoteRes.ok) throw new Error(`Crear cotización: ${JSON.stringify(quote)}`);
  log('2', `Cotización creada: ${quote.orderNumber} (${quote.id})`);

  await sleep(1500);

  let leadCheck = await fetch(`${NEXUS}/api/office/leads/from-ierp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Ierp-Key': API_KEY },
    body: JSON.stringify({
      follow_up: true,
      ierp_tenant_id: tenantId,
      ierp_quote_id: quote.id,
      ierp_quote_number: quote.orderNumber,
      ierp_company_id: company.id,
      ierp_company_name: company.name,
      contact_name: 'E2E Tester',
      total: Number(quote.total),
      currency: quote.currency,
      division: 'energia',
      quote_status: 'QUOTE',
      quote_authorization_status: quote.quoteAuthorizationStatus || 'NONE',
      pipeline_stage_name: Array.isArray(stages) && stages[0] ? stages[0].name : null,
    }),
  });
  let leadData = await leadCheck.json();
  if (!leadCheck.ok && leadCheck.status !== 200) {
    // puede ser upsert 200
  }
  const leadUuid = leadData.lead?.uuid;
  if (!leadUuid) {
    await sleep(2000);
    const syncRes = await fetch(`${NEXUS}/api/office/leads/sync-ierp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Ierp-Key': API_KEY },
      body: JSON.stringify({
        follow_up: true,
        ierp_tenant_id: tenantId,
        ierp_quote_id: quote.id,
        quote_status: 'QUOTE',
        quote_authorization_status: 'NONE',
      }),
    });
    leadData = await syncRes.json();
  }
  log('3', leadUuid ? `Lead Nexus: ${leadUuid}` : 'Lead aún no vinculado (sync async)');

  const subRes = await fetch(`${IERP}/api/sales/orders/${quote.id}/submit-authorization`, {
    method: 'POST',
    headers: ierpH,
  });
  const sub = await subRes.json();
  if (!subRes.ok) throw new Error(`Submit auth: ${JSON.stringify(sub)}`);
  log('4', `Auth enviada: ${sub.quoteAuthorizationStatus}`);

  await sleep(800);
  await fetch(`${NEXUS}/api/office/leads/sync-ierp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Ierp-Key': API_KEY },
    body: JSON.stringify({
      follow_up: true,
      ierp_tenant_id: tenantId,
      ierp_quote_id: quote.id,
      quote_status: 'QUOTE',
      quote_authorization_status: 'PENDING',
    }),
  });

  const appRes = await fetch(`${IERP}/api/sales/orders/${quote.id}/approve-quote`, {
    method: 'POST',
    headers: ierpH,
  });
  const approved = await appRes.json();
  if (!appRes.ok) throw new Error(`Approve: ${JSON.stringify(approved)}`);
  log('5', `Auth aprobada: ${approved.quoteAuthorizationStatus}`);

  await sleep(800);
  await fetch(`${NEXUS}/api/office/leads/sync-ierp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexus-Ierp-Key': API_KEY },
    body: JSON.stringify({
      follow_up: true,
      ierp_tenant_id: tenantId,
      ierp_quote_id: quote.id,
      quote_status: 'QUOTE',
      quote_authorization_status: 'APPROVED',
      pipeline_stage_name: Array.isArray(stages) && stages[0] ? stages[0].name : null,
    }),
  });

  const nx = await nexusSession();
  log('6', 'Login Nexus OK');

  const leadsRes = await fetch(`${NEXUS}/api/office/leads?tipo=ierp_proyecto`, {
    headers: nx.headers(),
  });
  const { leads } = await leadsRes.json();
  const lead = leads.find((l) => l.ierp_quote_id === quote.id);
  if (!lead) throw new Error('Lead no encontrado en Nexus tras sync');
  const det = await fetch(`${NEXUS}/api/office/leads/${lead.uuid}`, { headers: nx.headers() }).then((r) =>
    r.json(),
  );
  log('7', `Lead encontrado: ${lead.referencia} auth=${det.ierp_auth_status || lead.ierp_auth_status || '?'}`);

  if ((det.ierp_auth_status || lead.ierp_auth_status) !== 'APPROVED') {
    log('7', `Auth en Leads=${det.ierp_auth_status} (esperado APPROVED)`, false);
  }

  const assignRes = await fetch(
    `${NEXUS}/api/office/ierp/assignees?tenant_id=${encodeURIComponent(tenantId)}&search=admin`,
    { headers: nx.headers() },
  );
  const assignData = await assignRes.json();
  if (!assignRes.ok) throw new Error(`Assignees: ${JSON.stringify(assignData)}`);
  log('8', `Assignees iERP: ${(assignData.assignees || []).length} resultado(s)`);

  const vincRes = await fetch(`${NEXUS}/api/office/leads/${lead.uuid}/vinculos`, {
    method: 'POST',
    headers: nx.headers(),
    body: JSON.stringify({
      tipo: 'ot_servicio',
      titulo: `OT Servicio E2E ${quote.orderNumber}`,
      descripcion: 'Prueba automatizada',
      assignee_source: 'ierp_employee',
      assignee_id: assignData.assignees?.[0]?.id || null,
      assignee_name: assignData.assignees?.[0]?.name || 'Demo Admin',
      estado: 'pendiente',
    }),
  });
  const vinculo = await vincRes.json();
  if (!vincRes.ok) throw new Error(`Crear OT: ${JSON.stringify(vinculo)}`);
  log('9', `OT creada: ${vinculo.uuid || vinculo.titulo}`);

  const patchRes = await fetch(
    `${NEXUS}/api/office/leads/${lead.uuid}/vinculos/${vinculo.uuid}`,
    {
      method: 'PATCH',
      headers: nx.headers(),
      body: JSON.stringify({ estado: 'completado' }),
    },
  );
  const patched = await patchRes.json();
  if (!patchRes.ok) throw new Error(`Completar OT: ${JSON.stringify(patched)}`);
  log('10', 'OT marcada completada');

  const factRes = await fetch(
    `${NEXUS}/api/office/leads/${lead.uuid}/vinculos/${vinculo.uuid}/autorizar-facturacion`,
    { method: 'POST', headers: nx.headers(), body: JSON.stringify({}) },
  );
  const fact = await factRes.json();
  if (!factRes.ok) throw new Error(`Autorizar facturación: ${JSON.stringify(fact)}`);
  log('11', `Borrador factura iERP: ${fact.invoice?.invoiceNumber || fact.invoice?.id || 'OK'}`);

  const invId = fact.invoice?.id;
  if (invId) {
    const stRes = await fetch(`${IERP}/api/accounting/ecf/${invId}/status`, { headers: ierpH });
    const st = await stRes.json();
    log('12', stRes.ok ? `e-CF status factura: ${st.ecfStatus || 'NONE'}` : `e-CF status HTTP ${stRes.status}`);
  }

  console.log('\n=== E2E COMPLETADO ===\n');
}

main().catch((e) => {
  console.error('\n✗ E2E FALLÓ:', e.message);
  process.exit(1);
});
