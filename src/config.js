'use strict';
const fs = require('fs');
const path = require('path');

// Carrega o arquivo .env (se existir). Na Hostinger você pode usar o painel de variáveis de ambiente.
try {
  const f = path.join(__dirname, '..', '.env');
  if (fs.existsSync(f)) {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l) => {
      const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  }
} catch (e) { /* sem .env */ }

const e = process.env;
module.exports = {
  PORT: Number(e.PORT) || 3000,
  PROD: e.NODE_ENV === 'production',
  DB_DRIVER: e.DB_DRIVER || (e.DB_NAME ? 'mysql' : 'sqlite'),
  DB: {
    host: e.DB_HOST || 'localhost',
    port: Number(e.DB_PORT) || 3306,
    user: e.DB_USER,
    password: e.DB_PASSWORD,
    database: e.DB_NAME,
  },
  SQLITE_FILE: e.SQLITE_FILE || path.join(__dirname, '..', 'data', 'agenda-tti.db'),
  ADMIN_EMAIL: (e.ADMIN_EMAIL || '').trim().toLowerCase(),
  ADMIN_PASSWORD: e.ADMIN_PASSWORD || '',
  SESSION_DAYS: Number(e.SESSION_DAYS) || 30,
  PUBLIC_URL: (e.PUBLIC_URL || '').replace(/\/+$/, ''),
  APP_FILE: e.APP_FILE || path.join(__dirname, '..', 'public', 'index.html'),
  MAX_PHOTO_BYTES: 1.5 * 1024 * 1024,
  MAX_HOUSES_PER_OWNER: 60,
};
