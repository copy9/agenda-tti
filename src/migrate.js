'use strict';
const db = require('./db');

// SQL simples, compatível com MySQL e SQLite.
const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    email VARCHAR(190) NOT NULL PRIMARY KEY,
    role VARCHAR(10) NOT NULL,
    name VARCHAR(120) NOT NULL,
    wa VARCHAR(20) NOT NULL DEFAULT '',
    pass_hash VARCHAR(100) NOT NULL,
    code VARCHAR(16) NOT NULL,
    suspended INT NOT NULL DEFAULT 0,
    created BIGINT NOT NULL,
    UNIQUE (code)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id CHAR(64) NOT NULL PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    role VARCHAR(10) NOT NULL,
    exp BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS houses (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    owner_email VARCHAR(190) NOT NULL,
    slug VARCHAR(16) NOT NULL,
    doc LONGTEXT NOT NULL,
    updated BIGINT NOT NULL,
    UNIQUE (slug)
  )`,
  `CREATE TABLE IF NOT EXISTS blocks (
    house_id VARCHAR(40) NOT NULL PRIMARY KEY,
    dates LONGTEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invites (
    token CHAR(32) NOT NULL PRIMARY KEY,
    house_id VARCHAR(40) NOT NULL,
    owner_email VARCHAR(190) NOT NULL,
    broker_email VARCHAR(190) NOT NULL,
    status VARCHAR(10) NOT NULL,
    created BIGINT NOT NULL,
    accepted BIGINT NOT NULL DEFAULT 0,
    UNIQUE (house_id, broker_email)
  )`,
  `CREATE TABLE IF NOT EXISTS proposals (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    house_id VARCHAR(40) NOT NULL,
    broker_email VARCHAR(190) NOT NULL,
    owner_email VARCHAR(190) NOT NULL,
    status VARCHAR(12) NOT NULL,
    doc LONGTEXT NOT NULL,
    updated BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    to_email VARCHAR(190) NOT NULL,
    at BIGINT NOT NULL,
    doc LONGTEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS threads (
    id CHAR(40) NOT NULL PRIMARY KEY,
    o_email VARCHAR(190) NOT NULL,
    b_email VARCHAR(190) NOT NULL,
    doc LONGTEXT NOT NULL,
    updated BIGINT NOT NULL,
    UNIQUE (o_email, b_email)
  )`,
  `CREATE TABLE IF NOT EXISTS photos (
    id CHAR(40) NOT NULL PRIMARY KEY,
    house_id VARCHAR(40) NOT NULL,
    mime VARCHAR(20) NOT NULL,
    data LONGBLOB NOT NULL,
    created BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ustate (
    email VARCHAR(190) NOT NULL PRIMARY KEY,
    doc LONGTEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS consents (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    version VARCHAR(20) NOT NULL,
    at BIGINT NOT NULL,
    ip_hash CHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS data_requests (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    email_hash CHAR(64) NOT NULL,
    email VARCHAR(190) NOT NULL DEFAULT '',
    kind VARCHAR(12) NOT NULL,
    status VARCHAR(12) NOT NULL,
    created BIGINT NOT NULL,
    due BIGINT NOT NULL,
    done BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS uprefs (
    email VARCHAR(190) NOT NULL PRIMARY KEY,
    lang VARCHAR(2) NOT NULL DEFAULT 'pt',
    doc LONGTEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS push_subs (
    id CHAR(64) NOT NULL PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    endpoint LONGTEXT NOT NULL,
    p256dh VARCHAR(200) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    created BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outbox (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    to_email VARCHAR(190) NOT NULL,
    channel VARCHAR(8) NOT NULL,
    kind VARCHAR(30) NOT NULL,
    doc LONGTEXT NOT NULL,
    status VARCHAR(8) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    next_at BIGINT NOT NULL,
    last_error VARCHAR(300) NOT NULL DEFAULT '',
    created BIGINT NOT NULL,
    sent BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS pwreset (
    id CHAR(64) NOT NULL PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    exp BIGINT NOT NULL,
    used BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    k VARCHAR(60) NOT NULL PRIMARY KEY,
    v LONGTEXT NOT NULL
  )`,
];
const INDEXES = [
  ['idx_houses_owner', 'houses', 'owner_email'],
  ['idx_prop_house', 'proposals', 'house_id'],
  ['idx_prop_broker', 'proposals', 'broker_email'],
  ['idx_prop_owner', 'proposals', 'owner_email'],
  ['idx_noti_to', 'notifications', 'to_email'],
  ['idx_inv_broker', 'invites', 'broker_email'],
  ['idx_inv_owner', 'invites', 'owner_email'],
  ['idx_photos_house', 'photos', 'house_id'],
  ['idx_sess_email', 'sessions', 'email'],
  ['idx_consent_email', 'consents', 'email'],
  ['idx_push_email', 'push_subs', 'email'],
  ['idx_outbox_due', 'outbox', 'status'],
  ['idx_pwreset_email', 'pwreset', 'email'],
  ['idx_dreq_hash', 'data_requests', 'email_hash'],
];

async function migrate() {
  await db.open();
  for (const sql of TABLES) await db.run(sql);
  for (const [name, table, col] of INDEXES) {
    try { await db.run(`CREATE INDEX ${name} ON ${table} (${col})`); } catch (e) { /* já existe */ }
  }
  // Dados opcionais do perfil do corretor (cidades, CRECI, bio), em JSON.
  try { await db.run('ALTER TABLE users ADD COLUMN info TEXT'); } catch (e) { /* já existe */ }
}
module.exports = { migrate, TABLES };
