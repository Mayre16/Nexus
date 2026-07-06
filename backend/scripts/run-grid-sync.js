'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });
const scraper = require('../services/easymetering-scraper.service');

scraper.sincronizarAhora({ id: null })
  .then((r) => {
    console.log('Sync OK:', r);
    process.exit(0);
  })
  .catch((e) => {
    console.error('Sync error:', e.message);
    process.exit(1);
  });
