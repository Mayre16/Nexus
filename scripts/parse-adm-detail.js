'use strict';
const fs = require('fs');
const p = 'C:/Users/marth/.cursor/projects/c-Users-marth-Cursor-Projects-Nexus/agent-tools/39e0f427-8b52-4716-9c59-41d8ef0f827e.txt';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

function pathsForTag(tag) {
  return Object.entries(j.paths)
    .flatMap(([path, ops]) =>
      Object.entries(ops)
        .filter(([, op]) => (op.tags || []).includes(tag))
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    )
    .sort();
}

const focus = [
  'Quotes', 'SalesOrders', 'Projects', 'WorKOrders', 'ServiceRequests', 'Tasks',
  'Opportunities', 'FiscalSequences', 'FiscalSequenceTypes', 'ElectronicInvoicingTransactions',
  'EmissionPoints', 'CashInvoices', 'CreditInvoices', 'CustomerCreditNotes', 'CustomerDebitNotes',
  'Dispatchs', 'Receptions', 'Contacts', 'Employee', 'Customers', 'Items', 'PurchaseOrders',
  'Journals', 'Accounts', 'Activities', 'MaintenanceTasks', 'PreventiveMaintenancePlans',
];

for (const tag of focus) {
  const ps = pathsForTag(tag);
  if (!ps.length) continue;
  console.log(`\n## ${tag}`);
  ps.forEach((x) => console.log(' ', x));
}

function showDef(name) {
  const d = j.definitions?.[name];
  if (!d) return console.log('No def', name);
  const props = Object.keys(d.properties || {});
  console.log(`\n### ${name} (${props.length} props)`);
  console.log(props.slice(0, 40).join(', '));
  if (props.length > 40) console.log('...');
}

['Quote', 'SalesOrder', 'Project', 'WorkOrder', 'FiscalSequence', 'ElectronicInvoicingTransaction'].forEach(showDef);
