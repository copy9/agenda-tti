'use strict';
// Ambiente de teste compartilhado: banco SQLite em memória, servidor em porta livre e um cliente HTTP com cookies.
// Cada arquivo de teste roda em um processo próprio, então o estado não vaza entre arquivos.
process.env.SQLITE_FILE = ':memory:';
process.env.LOG_LEVEL = 'error';
process.env.DB_DRIVER = 'sqlite';
process.env.ADMIN_EMAIL = 'adm@tti.test';
process.env.ADMIN_PASSWORD = 'admin-secreta-1';
const path = require('path');
const fs = require('fs');
const os = require('os');
process.env.APP_FILE = path.join(os.tmpdir(), 'tti-fixture-' + process.pid + '.html');
fs.writeFileSync(process.env.APP_FILE, '<html><body><script>window.TTI_BOOT=null;</script></body></html>');

const test = require('node:test');
const assert = require('node:assert');
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const A = require('../src/auth');
const { build } = require('../src/app');

const env = { base: '', app: null };
test.before(async () => {
  await migrate(); await A.ensureAdmin();
  env.app = build();
  await new Promise((ok) => { env.app.listen(0, ok); });
  env.base = 'http://127.0.0.1:' + env.app.server.address().port;
});
test.after(async () => { env.app.server.close(); await db.close(); try { fs.unlinkSync(process.env.APP_FILE); } catch (e) { /* ok */ } });

class Client {
  constructor(ip) { this.ck = ''; this.ip = ip || '10.0.0.' + Math.floor(Math.random() * 250); }
  async call(method, p, body) {
    const r = await fetch(env.base + p, { method, headers: { 'content-type': 'application/json', cookie: this.ck, 'x-forwarded-for': this.ip }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) this.ck = sc.map((c) => c.split(';')[0]).join('; ');
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* html */ }
    return { status: r.status, j, txt, headers: r.headers };
  }
  get(p) { return this.call('GET', p); }
  post(p, b) { return this.call('POST', p, b || {}); }
  sync(ops) { return this.post('/api/sync', { ops }); }
}
const D = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
async function signup(role, email, name, extra) {
  const c = new Client();
  const r = await c.post('/api/register', Object.assign({ role, email, name, wa: '11999990000', pass: 'senha123', terms: true }, extra || {}));
  assert.equal(r.status, 200, r.txt);
  return c;
}
const house = (id, extra) => Object.assign({ id, name: 'Casa ' + id, loc: 'Angra', q: 5, s: 3, b: 6, lot: 12, v: 4, a: '500 m²', pool: 'Piscina', pets: 'Aceita', desc: 'Bela casa', rate: 5000, minN: 2, minSp: 0, adv: 50, hue: 200, am: ['pool'], rules: 'Silêncio após 22h' }, extra || {});

module.exports = { test, assert, db, Client, signup, house, D, env };
