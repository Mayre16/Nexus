'use strict';

/**
 * Genera DATABASE_URL de iERP apuntando a la misma MySQL que Nexus.
 * Uso: node scripts/build-ierp-database-url.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../config/.env') });

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '3306';
const user = encodeURIComponent(process.env.DB_USER || 'nexus_app');
const pass = encodeURIComponent(process.env.DB_PASSWORD || '');
const db = process.env.DB_NAME || 'adesa_nexus';

const url = `mysql://${user}:${pass}@${host}:${port}/${db}`;
console.log(url);
