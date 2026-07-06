'use strict';
const fs = require('fs');
const p = 'C:/Users/marth/.cursor/projects/c-Users-marth-Cursor-Projects-Nexus/agent-tools/39e0f427-8b52-4716-9c59-41d8ef0f827e.txt';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

function ops(tag) {
  return Object.entries(j.paths).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(([, op]) => (op.tags || []).includes(tag))
      .map(([m, op]) => ({ method: m.toUpperCase(), path, op })),
  );
}

['Login', 'Quotes', 'WorKOrders', 'Projects', 'ElectronicInvoicingTransactions'].forEach((tag) => {
  console.log('\n===', tag, '===');
  ops(tag).forEach(({ method, path, op }) => {
    const params = (op.parameters || []).map((x) => `${x.name}:${x.in}${x.required ? '*' : ''}`).join(', ');
    console.log(`${method} ${path}`);
    if (params) console.log('  params:', params);
  });
});

console.log('\n=== definition names sample (project/work/quote/fiscal) ===');
Object.keys(j.definitions || {})
  .filter((n) => /quote|sales|project|work|fiscal|electronic|invoice|ncf|nif/i.test(n))
  .slice(0, 60)
  .forEach((n) => console.log(n));
