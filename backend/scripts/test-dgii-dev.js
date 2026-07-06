'use strict';

/** Prueba DGII dev: submit-dgii → check-dgii en factura con e-CF GENERATED */
require('dotenv').config({ path: require('path').join(__dirname, '../../config/.env') });

const IERP = (process.env.IERP_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

async function main() {
  const login = await fetch(`${IERP}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.local', password: 'DemoPass123!' }),
  }).then((r) => r.json());

  const h = { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' };

  const list = await fetch(`${IERP}/api/accounting/ecf?status=GENERATED&limit=5`, { headers: h }).then((r) =>
    r.json(),
  );
  const invoice = list.items?.[0];
  if (!invoice) {
    console.log('⊘ Sin facturas e-CF GENERATED en demo. Publique una factura electrónica primero.');
    process.exit(0);
  }

  console.log(`→ Factura ${invoice.invoiceNumber} (${invoice.id}) estado=${invoice.ecfStatus}`);

  const submit = await fetch(`${IERP}/api/accounting/ecf/${invoice.id}/submit-dgii`, {
    method: 'POST',
    headers: h,
  }).then((r) => r.json());
  if (!submit.ecfTrackId && !submit.message) throw new Error(`submit: ${JSON.stringify(submit)}`);
  console.log(`✓ Enviado DGII dev trackId=${submit.ecfTrackId}`);

  const check = await fetch(`${IERP}/api/accounting/ecf/${invoice.id}/check-dgii`, {
    method: 'POST',
    headers: h,
  }).then((r) => r.json());
  if (check.ecfStatus !== 'APPROVED') throw new Error(`check: ${JSON.stringify(check)}`);
  console.log(`✓ Aprobado DGII dev código=${check.ecfSecurityCode}`);
}

main().catch((e) => {
  console.error('✗ DGII test:', e.message);
  process.exit(1);
});
