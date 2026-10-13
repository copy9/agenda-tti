'use strict';
// Rodar com:  npm test   (usa um banco SQLite em memória, não mexe nos seus dados)
process.env.SQLITE_FILE = ':memory:';
process.env.LOG_LEVEL = 'error';
process.env.DB_DRIVER = 'sqlite';
process.env.ADMIN_EMAIL = 'adm@tti.test';
process.env.ADMIN_PASSWORD = 'admin-secreta-1';
process.env.APP_FILE = require('path').join(__dirname, 'index.fixture.html');
require('fs').writeFileSync(process.env.APP_FILE, '<html><body><script>window.TTI_BOOT=null;</script></body></html>');

const test = require('node:test');
const assert = require('node:assert');
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const A = require('../src/auth');
const { build } = require('../src/app');

let base; let app;
test.before(async () => {
  await migrate(); await A.ensureAdmin();
  app = build();
  await new Promise((ok) => { app.listen(0, ok); });
  base = 'http://127.0.0.1:' + app.server.address().port;
});
test.after(async () => { app.server.close(); await db.close(); try { require('fs').unlinkSync(process.env.APP_FILE); } catch (e) { /* ok */ } });

class Client {
  constructor(ip) { this.ck = ''; this.ip = ip || '10.0.0.' + Math.floor(Math.random() * 250); }
  async call(method, path, body) {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie: this.ck, 'x-forwarded-for': this.ip }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) this.ck = sc.map((c) => c.split(';')[0]).join('; ');
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* html */ }
    return { status: r.status, j, txt, headers: r.headers };
  }
  get(p) { return this.call('GET', p); }
  post(p, b) { return this.call('POST', p, b || {}); }
  sync(ops) { return this.post('/api/sync', { ops }); }
}
const D = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };

async function signup(role, email, name) {
  const c = new Client();
  const r = await c.post('/api/register', { role, email, name, wa: '11999990000', pass: 'senha123' });
  assert.equal(r.status, 200, r.txt);
  return c;
}
const house = (id, extra) => Object.assign({ id, name: 'Casa ' + id, loc: 'Angra', q: 5, s: 3, b: 6, lot: 12, v: 4, a: '500 m²', pool: 'Piscina', pets: 'Aceita', desc: 'Bela casa', rate: 5000, minN: 2, minSp: 0, adv: 50, hue: 200, am: ['pool'], rules: 'Silêncio após 22h' }, extra || {});

let owner; let brk1; let brk2; let hid = 'hAAA1'; let tok1;

test('cadastro, login, senha errada e papel trocado', async () => {
  owner = await signup('owner', 'dono@x.com', 'Dono Um');
  brk1 = await signup('broker', 'b1@x.com', 'Corretor Um');
  brk2 = await signup('broker', 'b2@x.com', 'Corretor Dois');
  const c = new Client();
  assert.equal((await c.post('/api/login', { role: 'owner', email: 'dono@x.com', pass: 'errada1' })).status, 401);
  assert.equal((await c.post('/api/login', { role: 'broker', email: 'dono@x.com', pass: 'senha123' })).status, 409);
  assert.equal((await c.post('/api/login', { role: 'owner', email: 'dono@x.com', pass: 'senha123' })).status, 200);
  assert.equal((await c.post('/api/register', { role: 'owner', email: 'dono@x.com', name: 'x', wa: '11999990000', pass: 'senha123' })).status, 409);
  assert.equal((await c.post('/api/register', { role: 'owner', email: 'teste@teste.com', name: 'x', wa: '11999990000', pass: 'senha123' })).status, 409);
});

test('exige JSON (defesa contra CSRF) e sessão', async () => {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.equal(r.status, 415);
  assert.equal((await new Client().get('/api/sync')).status, 401);
});

test('proprietário cria casa; foto vira link /p/<id>; dados perigosos são limpos', async () => {
  const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]).toString('base64');
  const r = await owner.sync([{ c: 'houses', up: [house(hid, { name: 'Casa <b>Azul</b>', photos: [png], cap: ['Sala'] })] }]);
  assert.equal(r.status, 200, r.txt);
  const h = r.j.view.houses.find((x) => x.id === hid);
  assert.ok(h && !/[<>]/.test(h.name));
  assert.match(h.photos[0], /^\/p\/[a-f0-9]{40}$/);
  assert.ok(h.pg);
  const p = await owner.get(h.photos[0]);
  assert.equal(p.status, 200); assert.equal(p.headers.get('content-type'), 'image/png');
  const bad = await owner.sync([{ c: 'houses', up: [house('hBAD1', { photos: ['data:image/png;base64,AAAA'] })] }]);
  assert.equal(bad.status, 400);
});

test('outro proprietário não mexe na casa alheia', async () => {
  const o2 = await signup('owner', 'dono2@x.com', 'Dono Dois');
  const r = await o2.sync([{ c: 'houses', up: [house(hid, { name: 'Roubada' })] }]);
  assert.equal(r.status, 403);
  await o2.sync([{ c: 'houses', del: [hid] }]);
  assert.ok((await owner.get('/api/sync')).j.view.houses.find((x) => x.id === hid));
});

test('corretor sem convite não vê a casa nem cria proposta', async () => {
  assert.equal((await brk1.get('/api/sync')).j.view.brokers['b1@x.com'].houses.length, 0);
  const r = await brk1.sync([{ c: 'props', up: [{ id: 'p100000001', hid, in: D(30), out: D(33), value: 10000, guest: 'Cliente', pax: 4 }] }]);
  assert.equal(r.status, 403);
});

test('convite por link: só o e-mail convidado aceita', async () => {
  const r = await owner.post('/api/invites', { hid, email: 'b1@x.com' });
  assert.equal(r.status, 200, r.txt);
  tok1 = r.j.token; assert.match(r.j.url, /\?convite=[a-f0-9]{32}$/);
  assert.equal((await owner.post('/api/invites', { hid, email: 'b1@x.com' })).j.token, tok1);
  const info = await new Client().get('/api/invites/' + tok1);
  assert.equal(info.status, 200); assert.equal(info.j.email, 'b1@x.com'); assert.equal(info.j.exists, true);
  assert.equal((await brk2.post('/api/invites/accept', { token: tok1 })).status, 403);
  const ok = await brk1.post('/api/invites/accept', { token: tok1 });
  assert.equal(ok.status, 200);
  const hs = ok.j.view.brokers['b1@x.com'].houses;
  assert.equal(hs.length, 1); assert.equal(hs[0].id, 'r' + hid); assert.equal(hs[0].ro, true);
  assert.equal(hs[0].oe, 'dono@x.com');
  const t2 = (await owner.post('/api/invites', { hid, email: 'b2@x.com' })).j.token;
  assert.equal((await brk2.post('/api/invites/accept', { token: t2 })).status, 200);
});

test('proposta: valida regras e nunca deixa data duplicada', async () => {
  const mk = (id, a, b, extra) => ({ id, hid: 'r' + hid, in: D(a), out: D(b), value: 12000, guest: 'Cliente', pax: 4, msg: 'oi', ...extra });
  assert.equal((await brk1.sync([{ c: 'props', up: [mk('p100000002', 40, 41)] }])).status, 400); // mínimo 2 noites
  assert.equal((await brk1.sync([{ c: 'props', up: [mk('p100000003', -5, -2)] }])).status, 400); // passado
  assert.equal((await brk1.sync([{ c: 'props', up: [mk('p100000004', 40, 43, { pax: 99 })] }])).status, 400);
  const ok = await brk1.sync([{ c: 'props', up: [mk('p100000005', 40, 43)] }]);
  assert.equal(ok.status, 200, ok.txt);
  assert.equal((await brk2.sync([{ c: 'props', up: [mk('p100000006', 41, 44)] }])).status, 409); // sobreposto
  assert.equal((await brk2.sync([{ c: 'props', up: [mk('p100000007', 50, 53)] }])).status, 200);
});

test('PRIVACIDADE: corretor só enxerga datas seguradas, sem nomes, valores ou e-mails', async () => {
  const v = (await brk2.get('/api/sync')).j;
  const raw = JSON.stringify(v);
  assert.ok(!raw.includes('b1@x.com'), 'e-mail do outro corretor vazou');
  assert.ok(!raw.includes('Corretor Um'), 'nome do outro corretor vazou');
  assert.ok(!raw.includes('12000') || v.view.props.filter((p) => !p.ghost).every((p) => p.broker === 'b2@x.com'));
  const ghosts = v.view.props.filter((p) => p.ghost);
  assert.equal(ghosts.length, 1);
  assert.deepEqual(Object.keys(ghosts[0]).sort(), ['broker', 'exp', 'ghost', 'hid', 'id', 'in', 'out', 'status'].sort());
  assert.equal(ghosts[0].broker, '');
  assert.equal(v.view.chat.length, 0);
  assert.equal(Object.keys(v.view.owners).length >= 1, true);
  // não pode alterar proposta alheia nem fantasma
  const mine = (await brk1.get('/api/sync')).j.view.props.find((p) => p.id === 'p100000005');
  const r = await brk2.sync([{ c: 'props', up: [{ id: 'p100000005', status: 'cancelled' }] }]);
  assert.equal((await brk1.get('/api/sync')).j.view.props.find((p) => p.id === 'p100000005').status, mine.status);
  assert.ok(r.status === 200 || r.status === 403);
  // corretor não grava bloqueios
  await brk2.sync([{ c: 'blocks', up: { [hid]: [D(70)] } }]);
  assert.ok(!((await owner.get('/api/sync')).j.view.blocks[hid] || []).includes(D(70)));
});

test('proprietário vê todas as propostas e aceita: bloqueia noites e notifica', async () => {
  const v = (await owner.get('/api/sync')).j.view;
  assert.equal(v.props.length, 2);
  const r = await owner.sync([{ c: 'props', up: [{ id: 'p100000005', status: 'accepted' }] }]);
  assert.equal(r.status, 200, r.txt);
  assert.deepEqual(r.j.view.blocks[hid].sort(), [D(40), D(41), D(42)]);
  const bv = (await brk2.get('/api/sync')).j.view;
  assert.ok(bv.houses === undefined || true);
  assert.ok(bv.brokers['b2@x.com'].houses[0].blocked.includes(D(41)));
  // aceitar de novo ou voltar atrás é recusado
  assert.equal((await owner.sync([{ c: 'props', up: [{ id: 'p100000005', status: 'rejected' }] }])).status, 409);
  // corretor não aceita pelo dono
  assert.equal((await brk2.sync([{ c: 'props', up: [{ id: 'p100000007', status: 'accepted' }] }])).status, 409);
  // contraproposta e aceite do corretor
  assert.equal((await owner.sync([{ c: 'props', up: [{ id: 'p100000007', status: 'countered', counter: 15000 }] }])).status, 200);
  const a = await brk2.sync([{ c: 'props', up: [{ id: 'p100000007', status: 'accepted' }] }]);
  assert.equal(a.status, 200, a.txt);
  assert.equal(a.j.view.props.find((p) => p.id === 'p100000007').final, 15000);
});

test('conversa: só participantes, só texto novo', async () => {
  const r = await owner.sync([{ c: 'chat', up: [{ o: 'dono@x.com', b: 'b1@x.com', m: [{ t: 'Olá!' }], s: { o: Date.now() } }] }]);
  assert.equal(r.status, 200, r.txt);
  assert.equal(r.j.view.chat.find((c) => c.b === 'b1@x.com').m.length, 1);
  assert.equal((await brk2.get('/api/sync')).j.view.chat.some((c) => c.b === 'b1@x.com'), false);
  await brk2.sync([{ c: 'chat', up: [{ o: 'dono@x.com', b: 'b1@x.com', m: [{ t: 'invasor' }] }] }]);
  assert.equal((await brk1.get('/api/sync')).j.view.chat[0].m.length, 1);
});

test('página pública da casa não expõe e-mails nem dados privados', async () => {
  const h = (await owner.get('/api/sync')).j.view.houses.find((x) => x.id === hid);
  const code = (await brk1.get('/api/session')).j.user.code;
  const r = await new Client().get('/api/public/house/' + h.pg + '?b=' + code);
  assert.equal(r.status, 200);
  assert.equal(r.j.bn, 'Corretor Um'); assert.equal(r.j.wa, '11999990000');
  assert.ok(!/dono@x\.com|@/.test(r.txt));
  assert.equal(r.j.ph.length, 1);
  assert.equal((await new Client().get('/api/public/house/naoexiste')).status, 404);
  const pg = await new Client().get('/c/' + h.pg);
  assert.match(pg.txt, /window\.TTI_BOOT=\{/);
});

test('administração: login, vê tudo sem ler conversas, suspende e cancela', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/admin/login', { email: 'adm@tti.test', pass: 'errada' })).status, 401);
  assert.equal((await owner.post('/api/admin/suspend', { email: 'b1@x.com', on: true })).status, 403);
  assert.equal((await c.post('/api/admin/login', { email: 'adm@tti.test', pass: 'admin-secreta-1' })).status, 200);
  const v = (await c.get('/api/sync')).j.view;
  assert.ok(v.owners['dono@x.com'] && v.brokers['b1@x.com']);
  assert.ok(v.chat.every((x) => x.m.length === 0));
  const s = await c.post('/api/admin/suspend', { email: 'b1@x.com', on: true });
  assert.equal(s.status, 200); assert.ok(s.j.view.susp['b1@x.com']);
  assert.equal((await brk1.get('/api/sync')).status, 401);
  assert.equal((await new Client().post('/api/login', { role: 'broker', email: 'b1@x.com', pass: 'senha123' })).status, 403);
  await c.post('/api/admin/suspend', { email: 'b1@x.com', on: false });
  const bk = await c.get('/api/admin/backup');
  assert.equal(bk.status, 200); assert.ok(!bk.txt.includes('pass_hash')); assert.ok(bk.j.users.length >= 4);
  assert.equal((await c.post('/api/admin/password', { old: 'admin-secreta-1', new: 'outra-senha-9' })).status, 200);
  assert.equal((await new Client().post('/api/admin/login', { email: 'adm@tti.test', pass: 'outra-senha-9' })).status, 200);
});

test('excluir conta apaga casas e dados ligados', async () => {
  const c = new Client();
  await c.post('/api/admin/login', { email: 'adm@tti.test', pass: 'outra-senha-9' });
  const r = await c.post('/api/admin/delete-user', { email: 'dono@x.com' });
  assert.equal(r.status, 200);
  assert.equal(r.j.view.houses.length, 0);
  assert.equal((await db.one('SELECT COUNT(*) AS n FROM photos')).n, 0);
});

test('limite de tentativas de login', async () => {
  const c = new Client('9.9.9.9');
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await c.post('/api/login', { role: 'owner', email: 'alvo@x.com', pass: 'x' + i })).status;
  assert.equal(last, 429);
});
