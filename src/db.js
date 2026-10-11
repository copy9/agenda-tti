'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { mutex } = require('./util');

const norm = (r) => {
  const o = {};
  for (const k of Object.keys(r)) { const v = r[k]; o[k] = v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v) : v; }
  return o;
};

function mysqlDriver() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: cfg.DB.host, port: cfg.DB.port, user: cfg.DB.user, password: cfg.DB.password, database: cfg.DB.database,
    charset: 'utf8mb4', waitForConnections: true, connectionLimit: 6, supportBigNumbers: true, bigNumberStrings: false,
  });
  const wrap = (c) => ({
    all: async (sql, p = []) => { const [r] = await c.query(sql, p); return r; },
    run: async (sql, p = []) => { const [r] = await c.query(sql, p); return { changes: r.affectedRows }; },
  });
  return {
    dialect: 'mysql',
    ...wrap(pool),
    async tx(fn) {
      const c = await pool.getConnection();
      try { await c.beginTransaction(); const r = await fn(wrap(c)); await c.commit(); return r; }
      catch (e) { try { await c.rollback(); } catch (x) { /* ignora */ } throw e; }
      finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

function sqliteDriver() {
  const { DatabaseSync } = require('node:sqlite');
  const file = cfg.SQLITE_FILE;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode=WAL');
  const api = {
    all: async (sql, p = []) => db.prepare(sql).all(...p).map(norm),
    run: async (sql, p = []) => ({ changes: Number(db.prepare(sql).run(...p).changes) }),
  };
  return {
    dialect: 'sqlite',
    ...api,
    async tx(fn) {
      db.exec('BEGIN');
      try { const r = await fn(api); db.exec('COMMIT'); return r; }
      catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignora */ } throw e; }
    },
    close: async () => db.close(),
  };
}

let drv = null;
const lock = mutex();

async function open() {
  if (drv) return drv;
  drv = cfg.DB_DRIVER === 'mysql' ? mysqlDriver() : sqliteDriver();
  return drv;
}
async function close() { if (drv) { await drv.close(); drv = null; } }

// Leituras diretas (sem fila) e gravações em transação, uma por vez.
const db = {
  open, close,
  get dialect() { return drv && drv.dialect; },
  all: (sql, p) => drv.all(sql, p),
  one: async (sql, p) => (await drv.all(sql, p))[0] || null,
  run: (sql, p) => drv.run(sql, p),
  write: (fn) => lock(() => drv.tx(fn)),
};
module.exports = db;
