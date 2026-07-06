'use strict';
/** Verifica integración iERP como módulo Nexus */

const BASE = 'http://localhost:3000';

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  const text = await r.text();
  return { ok: r.ok, status: r.status, text: text.slice(0, 200) };
}

async function main() {
  const checks = [
    ['Nexus health', '/api/health'],
    ['iERP API proxy', '/api/ierp/health'],
    ['iERP UI proxy', '/modules/ierp/login'],
  ];

  let fail = 0;
  for (const [name, path] of checks) {
    const r = await get(path);
    const ok = r.ok;
    if (!ok) fail++;
    console.log(`[${ok ? 'OK' : 'FAIL'}] ${name} (${path}) → ${r.status}`);
  }

  // Login Nexus + list modules
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@adesa.com.do', password: 'ChangeMe!2025' }),
  }).catch(() => null);

  if (login?.ok) {
    const cookie = login.headers.get('set-cookie');
    const mod = await fetch(`${BASE}/api/modules`, {
      headers: cookie ? { Cookie: cookie.split(';')[0] } : {},
    });
    if (mod.ok) {
      const data = await mod.json();
      const ierp = data.modulos?.find((m) => m.technicalName === 'ierp');
      console.log(`[${ierp ? 'OK' : 'FAIL'}] iERP en registry → ${ierp?.routes?.ui || 'missing'}`);
      if (!ierp) fail++;
    }
  } else {
    console.log('[SKIP] /api/modules (login Nexus no disponible con credenciales demo)');
  }

  console.log(fail ? `\n${fail} fallos` : '\nIntegración módulo iERP OK');
  process.exit(fail ? 1 : 0);
}

main();
