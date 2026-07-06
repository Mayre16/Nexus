'use strict';
const fs = require('fs');
const p = 'C:/Users/marth/.cursor/projects/c-Users-marth-Cursor-Projects-Nexus/agent-tools/39e0f427-8b52-4716-9c59-41d8ef0f827e.txt';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const defs = j.definitions || {};

function showProps(name, limit = 25) {
  const d = defs[name];
  if (!d?.properties) return;
  const props = Object.entries(d.properties).slice(0, limit);
  console.log(`\n${name}:`);
  props.forEach(([k, v]) => console.log(`  ${k}: ${v.type || v.$ref || JSON.stringify(v).slice(0, 60)}`));
}

[
  'PA_Projects', 'PA_Projects_Tasks', 'vwWorkOrders', 'vwSalesOrders',
  'SA_Fiscal_Sequences', 'SA_ElectronicInvoicing', 'SA_Trans_Fiscals',
].forEach((n) => showProps(n));

// Global auth pattern
const sample = j.paths['/api/Quotes']?.get?.parameters?.map((x) => x.name) || [];
console.log('\nCommon query params on Quotes GET:', sample.join(', '));
