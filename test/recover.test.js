'use strict';
const { test, assert, db, Client, signup } = require('./helpers');
const cfg = require('../src/config');

async function mails(to) {
  const rows = await db.all("SELECT kind, doc FROM outbox WHERE to_email = ? AND channel = 'email' ORDER BY created", [to]);
  return rows.map((r) => ({ kind: r.kind, text: JSON.parse(r.doc).text }));
}
const tokenOf = (m) => /\?redefinir=([a-f0-9]{64})/.exec(m.text)[1];
const withSmtp = async (fn) => { const old = cfg.SMTP_HOST; cfg.SMTP_HOST = 'smtp.invalid'; try { await fn(); } finally { cfg.SMTP_HOST = old; } };

test('esqueci a senha: resposta igual para e-mail existente ou não, e só o existente recebe link', () => withSmtp(async () => {
  await signup('owner', 'rec1@x.com', 'Rec Um');
  const c = new Client();
  const a = await c.post('/api/forgot', { email: 'rec1@x.com' });
  const b = await c.post('/api/forgot', { email: 'ninguem@x.com' });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(a.j, b.j);
  assert.equal((await mails('rec1@x.com')).filter((m) => m.kind === 'password_reset').length, 1);
  assert.equal((await mails('ninguem@x.com')).length, 0);
}));

test('o link troca a senha uma única vez, encerra sessões e avisa por e-mail', () => withSmtp(async () => {
  const u = await signup('owner', 'rec2@x.com', 'Rec Dois');
  assert.equal((await u.get('/api/sync')).status, 200);
  await new Client().post('/api/forgot', { email: 'rec2@x.com' });
  const tk = tokenOf((await mails('rec2@x.com')).find((m) => m.kind === 'password_reset'));
  const saved = await db.one('SELECT id FROM pwreset WHERE email = ?', ['rec2@x.com']);
  assert.notEqual(saved.id, tk, 'no banco fica só o hash');
  const c = new Client();
  assert.equal((await c.post('/api/reset', { token: tk, pass: '123' })).status, 400);
  assert.equal((await c.post('/api/reset', { token: tk, pass: 'novaSenha1' })).status, 200);
  assert.equal((await u.get('/api/sync')).status, 401, 'sessão antiga encerrada');
  const again = await c.post('/api/reset', { token: tk, pass: 'outra123' });
  assert.equal(again.status, 400); assert.equal(again.j.code, 'reset');
  assert.equal((await new Client().post('/api/login', { email: 'rec2@x.com', pass: 'senha123', role: 'owner' })).status, 401);
  assert.equal((await new Client().post('/api/login', { email: 'rec2@x.com', pass: 'novaSenha1', role: 'owner' })).status, 200);
  assert.ok((await mails('rec2@x.com')).some((m) => m.kind === 'password_changed'));
}));

test('link vencido, inventado ou de pedido substituído não funciona', () => withSmtp(async () => {
  await signup('owner', 'rec3@x.com', 'Rec Três');
  const c = new Client();
  await c.post('/api/forgot', { email: 'rec3@x.com' });
  const t1 = tokenOf((await mails('rec3@x.com'))[0]);
  await db.write((t) => t.run('UPDATE pwreset SET exp = ? WHERE email = ?', [Date.now() - 1, 'rec3@x.com']));
  assert.equal((await c.post('/api/reset', { token: t1, pass: 'novaSenha1' })).status, 400);
  assert.equal((await c.post('/api/reset', { token: 'a'.repeat(64), pass: 'novaSenha1' })).status, 400);
  assert.equal((await c.post('/api/reset', { token: 'x', pass: 'novaSenha1' })).status, 400);
  await c.post('/api/forgot', { email: 'rec3@x.com' }); // pedido novo apaga o anterior
  const rows = await db.all('SELECT id FROM pwreset WHERE email = ?', ['rec3@x.com']);
  assert.equal(rows.length, 1);
}));

test('limite: no máximo 3 pedidos por hora por e-mail, sem revelar nada', () => withSmtp(async () => {
  await signup('owner', 'rec4@x.com', 'Rec Quatro');
  const c = new Client();
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/forgot', { email: 'rec4@x.com' })).status, 200);
  assert.equal((await mails('rec4@x.com')).filter((m) => m.kind === 'password_reset').length, 3);
  assert.equal((await c.post('/api/forgot', { email: 'invalido' })).status, 400);
}));
