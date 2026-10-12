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
  SERVICE_NAME: e.OTEL_SERVICE_NAME || 'agenda-tti',
  LOG_LEVEL: (e.LOG_LEVEL || 'info').toLowerCase(),
  SENTRY_DSN: e.SENTRY_DSN || '',
  SENTRY_ENV: e.SENTRY_ENVIRONMENT || (e.NODE_ENV === 'production' ? 'production' : 'development'),
  RELEASE: e.RELEASE || '',
  TRACES_SAMPLE_RATE: Math.min(1, Math.max(0, Number(e.TRACES_SAMPLE_RATE) || 0.1)),
  OTEL_ENABLED: !!(e.OTEL_EXPORTER_OTLP_ENDPOINT || e.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT),
  METRICS_TOKEN: e.METRICS_TOKEN || '',
  // Documentos legais (#23). Mude a versão quando o texto mudar: todos precisam aceitar de novo.
  LEGAL_VERSION: e.LEGAL_VERSION || '2026-10-12',
  LEGAL_REVIEWED: e.LEGAL_REVIEWED === '1',
  COMPANY_NAME: e.COMPANY_NAME || 'Agenda TTI',
  LEGAL_CONTACT: (e.LEGAL_CONTACT || e.ADMIN_EMAIL || '').trim(),
  DELETE_GRACE_DAYS: Math.max(0, Number(e.DELETE_GRACE_DAYS) || 7),
  // E-mail (SMTP) e push web (#11). Sem SMTP_HOST, o e-mail fica desligado; o push usa chaves VAPID geradas e guardadas no banco.
  SMTP_HOST: e.SMTP_HOST || '',
  SMTP_PORT: Number(e.SMTP_PORT) || 587,
  SMTP_SECURITY: ['tls', 'none'].includes((e.SMTP_SECURITY || '').toLowerCase()) ? e.SMTP_SECURITY.toLowerCase() : 'starttls',
  SMTP_USER: e.SMTP_USER || '',
  SMTP_PASS: e.SMTP_PASS || '',
  MAIL_FROM: e.MAIL_FROM || '',
  VAPID_SUBJECT: e.VAPID_SUBJECT || '',
  PUSH_HOSTS: (e.PUSH_HOSTS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
  PUSH_ALLOW_INSECURE: e.PUSH_ALLOW_INSECURE === '1',
  OUTBOX_MAX_ATTEMPTS: Math.max(1, Number(e.OUTBOX_MAX_ATTEMPTS) || 5),
  MAX_PHOTO_BYTES: 1.5 * 1024 * 1024,
  MAX_HOUSES_PER_OWNER: 60,
};
