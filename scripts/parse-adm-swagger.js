'use strict';
const fs = require('fs');
const p = 'C:/Users/marth/.cursor/projects/c-Users-marth-Cursor-Projects-Nexus/agent-tools/39e0f427-8b52-4716-9c59-41d8ef0f827e.txt';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const paths = Object.keys(j.paths || {});
const tags = new Set();
const byTag = {};
paths.forEach((path) => {
  Object.entries(j.paths[path]).forEach(([method, op]) => {
    (op.tags || []).forEach((t) => {
      tags.add(t);
      if (!byTag[t]) byTag[t] = [];
      byTag[t].push(`${method.toUpperCase()} ${path}`);
    });
  });
});
console.log('Total paths:', paths.length);
console.log('Total tags:', tags.size);
console.log('\n=== TAGS ===');
[...tags].sort().forEach((t) => console.log(`${t} (${byTag[t].length})`));

const keywords = /quote|cotiz|sales|order|invoice|factur|ncf|ecf|project|proyect|lead|contact|employee|inventory|warehouse|purchase|payment|account|journal|dgii|tax|delivery|ship|work.?order|ot|ticket|crm|customer|supplier|product|price/i;
console.log('\n=== RELEVANT PATHS ===');
paths.filter((p) => keywords.test(p)).sort().forEach((p) => {
  const methods = Object.keys(j.paths[p]).join(',');
  const tag = j.paths[p][Object.keys(j.paths[p])[0]]?.tags?.[0] || '';
  console.log(`${methods.padEnd(12)} ${p} [${tag}]`);
});
