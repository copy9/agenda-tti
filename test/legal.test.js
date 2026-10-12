'use strict';
const { test, assert, db, Client, signup, house } = require('./helpers');
const cfg = require('../src/config');
const L = require('../src/legal');

test('cadastro exige aceite dos termos e registra versão e data', async () => {
  const c = new Client();
  const base = { role: 'owner', email: 'novo@x.com', name: 'Novo', wa: '11999990000', pass: 'senha123' };
  const r = await c.post('/api/register', base);
  assert.equal(r.status, 400); assert.equal(r.j.code, 'terms');
  assert.equal((await c.post('/api/register', Object.assign({ terms: 'sim' }, base))).status, 400);
  assert.equal((await c.post('/api/register', Object.assign({ terms: true }, base))).status, 200);
  const rows = await db.all('SELECT kind, version, at, ip_hash FROM consents WHERE email = ?', ['novo@x.com']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, cfg.LEGAL_VERSION);
  assert.ok(Number(rows[0].at) > Date.now() - 5000);
  assert.match(rows[0].ip_hash, /^[a-f0-9]{64}$/);
});

test('páginas de termos e privacidade nos 3 idiomas, com versão e aviso de minuta', async () => {
  const c = new Client();
  for (const [path, lang, needle] of [['/termos', 'pt', 'Termos de uso'], ['/termos?lg=en', 'en', 'Terms of use'], ['/termos?lg=es', 'es', 'Términos de uso'], ['/privacidade', 'pt', 'Política de privacidade'], ['/privacidade?lg=en', 'en', 'Privacy policy'], ['/privacidade?lg=es', 'es', 'Política de privacidad']]) {
    const r = await c.get(path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.ok(r.txt.includes(needle), path);
    assert.ok(r.txt.includes('lang="' + lang + '"'), path);
    assert.ok(r.txt.includes(cfg.LEGAL_VERSION), path);
    assert.ok(r.txt.includes('class="dr"'), 'aviso de minuta em ' + path);
    assert.ok(!r.txt.includes('{company}') && !r.txt.includes('{grace}'), 'marcador sem preencher em ' + path);
  }
  assert.ok((await c.get('/termos?lg=xx')).txt.includes('lang="pt"'));
  assert.ok((await c.get('/privacidade')).txt.includes('Lei Geral de Proteção de Dados'));
  assert.ok((await c.get('/termos')).txt.includes('Trava de datas e anotações no perfil do corretor'));
});

test('quando a versão muda, o usuário precisa aceitar de novo antes de continuar', async () => {
  const u = await signup('owner', 'versao@x.com', 'Dono Versão');
  assert.equal((await u.get('/api/sync')).status, 200);
  const antiga = cfg.LEGAL_VERSION;
  cfg.LEGAL_VERSION = '2099-01-01';
  try {
    const r = await u.get('/api/sync');
    assert.equal(r.status, 403); assert.equal(r.j.code, 'terms');
    assert.equal((await u.sync([])).status, 403);
    assert.equal((await u.post('/api/terms/accept', { version: antiga })).status, 409);
    assert.equal((await u.post('/api/terms/accept', { version: '2099-01-01' })).status, 200);
    assert.equal((await u.get('/api/sync')).status, 200);
    assert.equal((await db.all("SELECT 1 FROM consents WHERE email = 'versao@x.com'")).length, 2);
  } finally { cfg.LEGAL_VERSION = antiga; }
});

test('baixar os próprios dados traz só o que a pessoa pode ver e nenhuma senha', async () => {
  const dono = await signup('owner', 'exp-dono@x.com', 'Dono Exporta');
  const b1 = await signup('broker', 'exp-b1@x.com', 'Corretor Exp Um');
  await signup('broker', 'exp-b2@x.com', 'Corretor Exp Dois');
  await dono.sync([{ c: 'houses', up: [house('hEXP1')] }]);
  await dono.post('/api/invites', { hid: 'hEXP1', email: 'exp-b1@x.com' });
  assert.equal((await new Client().get('/api/me/export')).status, 401);
  const r = await b1.get('/api/me/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal(r.j.account.email, 'exp-b1@x.com');
  assert.equal(r.j.consents[0].version, cfg.LEGAL_VERSION);
  for (const n of ['pass_hash', 's1$', 'exp-b2@x.com', 'Corretor Exp Dois']) assert.ok(!r.txt.includes(n), 'vazou ' + n);
  const od = await dono.get('/api/me/export');
  assert.ok(od.txt.includes('hEXP1') && !od.txt.includes('exp-b2@x.com'));
});

test('exclusão da conta: senha, carência, cancelamento e execução com registro mínimo', async () => {
  const u = await signup('broker', 'sai@x.com', 'Corretor Sai');
  assert.equal((await u.post('/api/me/delete', { pass: 'errada' })).status, 403);
  const r = await u.post('/api/me/delete', { pass: 'senha123' });
  assert.equal(r.status, 200); assert.equal(r.j.pending, true);
  const dias = (r.j.due - Date.now()) / 864e5;
  assert.ok(dias > cfg.DELETE_GRACE_DAYS - 0.01 && dias <= cfg.DELETE_GRACE_DAYS);
  assert.equal((await u.post('/api/me/delete', { pass: 'senha123' })).j.due, r.j.due, 'pedido repetido não duplica');
  assert.equal((await u.get('/api/me/delete')).j.pending, true);
  assert.equal((await u.post('/api/me/delete/cancel')).j.canceled, true);
  assert.equal((await u.get('/api/me/delete')).j.pending, false);
  await L.processDue();
  assert.equal((await u.get('/api/sync')).status, 200, 'cancelado não apaga');

  await u.post('/api/me/delete', { pass: 'senha123' });
  assert.equal(await L.processDue(), 0, 'ainda na carência');
  await db.run("UPDATE data_requests SET due = ? WHERE status = 'pending'", [Date.now() - 1000]);
  assert.equal(await L.processDue(), 1);
  assert.equal((await new Client().post('/api/login', { role: 'broker', email: 'sai@x.com', pass: 'senha123' })).status, 401);
  assert.equal((await db.all("SELECT 1 FROM consents WHERE email = 'sai@x.com'")).length, 0);
  const reg = await db.all('SELECT email, status FROM data_requests WHERE status = ?', ['done']);
  assert.equal(reg.length, 1); assert.equal(reg[0].email, '', 'o e-mail não fica no registro');
});
