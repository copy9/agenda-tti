'use strict';
process.env.MP_ACCESS_TOKEN = 'TEST-token-mp';
process.env.MP_WEBHOOK_SECRET = 'segredo-do-webhook';
process.env.PUBLIC_URL = 'https://agenda.test';
const crypto = require('node:crypto');
const { test, assert, signup, Client, house } = require('./helpers');
const B = require('../src/billing');

// Mercado Pago simulado: guarda as assinaturas criadas e responde como a API de verdade.
const mp = { subs: {}, calls: [], n: 0 };
B.setHttp(async (url, opt) => {
  const path = url.replace('https://api.mercadopago.com', '');
  const body = opt.body ? JSON.parse(opt.body) : null;
  mp.calls.push({ method: opt.method, path, body, auth: opt.headers.Authorization, idem: opt.headers['X-Idempotency-Key'] });
  const out = (j, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(j) });
  if (opt.method === 'POST' && path === '/preapproval') {
    if (!body.payer_email) return out({ message: 'payer_email is required' }, 400);
    const id = 'pa' + (++mp.n);
    mp.subs[id] = { id, status: 'pending', external_reference: body.external_reference, next_payment_date: null, amount: body.auto_recurring.transaction_amount };
    return out({ id, init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=' + id });
  }
  const m = path.match(/^\/preapproval\/(\w+)$/);
  if (m && opt.method === 'GET') return mp.subs[m[1]] ? out(mp.subs[m[1]]) : out({ message: 'not found' }, 404);
  if (m && opt.method === 'PUT') { mp.subs[m[1]].status = body.status; return out(mp.subs[m[1]]); }
  const ap = path.match(/^\/authorized_payments\/(\w+)$/);
  if (ap) return out({ id: ap[1], preapproval_id: 'pa' + mp.n });
  return out({}, 404);
});

const sign = (id, reqId, ts = '1700000000') => `ts=${ts},v1=${crypto.createHmac('sha256', 'segredo-do-webhook').update(`id:${id.toLowerCase()};request-id:${reqId};ts:${ts};`).digest('hex')}`;
async function hook(id, type, good = true) {
  const c = new Client();
  const r = await fetch(`${require('./helpers').env.base}/api/billing/webhook?type=${type}&data.id=${id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'rq1', 'x-signature': good ? sign(id, 'rq1') : 'ts=1,v1=' + '0'.repeat(64) }, body: '{}' });
  void c;
  return r.status;
}
async function admin() {
  const a = new Client();
  assert.equal((await a.post('/api/admin/login', { email: 'adm@tti.test', pass: 'admin-secreta-1' })).status, 200);
  return a;
}
const pay = async (c) => (await c.get('/api/billing')).j.pay;

test('conta nova começa em período grátis de 7 dias e usa tudo normalmente', async () => {
  const c = await signup('owner', 'bl-o1@x.com', 'Dono Bill');
  const p = await pay(c);
  assert.equal(p.status, 'trial');
  assert.equal(p.daysLeft, 7);
  assert.equal(p.price, 10);
  assert.equal(p.blocked, false);
  assert.equal((await c.get('/api/sync')).status, 200);
  assert.equal((await c.get('/api/session')).j.user.pay.status, 'trial');
});

test('administrador muda dias grátis e valor; conta vencida é bloqueada, mas páginas públicas e dados seguem abertos', async () => {
  const dono = await signup('owner', 'bl-o2@x.com', 'Dono Vence');
  await dono.sync([{ c: 'houses', up: [house('hBL1', { name: 'Casa Cobrança' })] }]);
  const slug = (await dono.get('/api/sync')).j.view.houses[0].pg;
  const adm = await admin();
  let v = (await adm.post('/api/admin/billing', { trial: 0 })).j;
  assert.equal(v.settings.trial, 0);
  const p = await pay(dono);
  assert.equal(p.status, 'expired');
  assert.equal(p.blocked, true);
  const r = await dono.get('/api/sync');
  assert.equal(r.status, 402);
  assert.equal(r.j.code, 'billing');
  assert.equal((await dono.get('/api/me/export')).status, 200, 'exportar os dados continua liberado');
  assert.equal((await new Client().get('/api/public/house/' + slug)).status, 200, 'página pública da casa segue aberta');
  assert.equal((await adm.post('/api/admin/billing', { trial: 7 })).j.settings.trial, 7);
  assert.equal((await dono.get('/api/sync')).status, 200, 'voltar os dias grátis libera de novo');
});

test('valores inválidos no painel são recusados', async () => {
  const adm = await admin();
  for (const b of [{ price: 0 }, { price: 'abc' }, { price: 99999 }, { trial: -1 }, { trial: 1.5 }, { trial: 400 }, { roles: 'todos' }]) {
    assert.equal((await adm.post('/api/admin/billing', b)).status, 400, JSON.stringify(b));
  }
  assert.equal((await new Client().post('/api/admin/billing', { trial: 1 })).status, 401);
  assert.equal((await (await signup('owner', 'bl-o3@x.com', 'Sem Poder')).post('/api/admin/billing', { trial: 1 })).status, 403);
});

test('assinar cria a assinatura recorrente no Mercado Pago e o aviso assinado libera a conta', async () => {
  const adm = await admin();
  await adm.post('/api/admin/billing', { trial: 0, price: 10 });
  const cor = await signup('broker', 'bl-c1@x.com', 'Corretor Paga');
  assert.equal((await cor.get('/api/sync')).status, 402);
  const r = await cor.post('/api/billing/subscribe');
  assert.equal(r.status, 200, r.txt);
  assert.match(r.j.url, /^https:\/\/www\.mercadopago\.com\.br\//);
  const call = mp.calls.filter((x) => x.method === 'POST' && x.path === '/preapproval').pop();
  assert.equal(call.auth, 'Bearer TEST-token-mp');
  assert.ok(call.idem);
  assert.deepEqual(call.body.auto_recurring, { frequency: 1, frequency_type: 'months', transaction_amount: 10, currency_id: 'BRL' });
  assert.equal(call.body.back_url, 'https://agenda.test/?assinatura=retorno');
  assert.equal(call.body.payer_email, 'bl-c1@x.com', 'o Mercado Pago exige o e-mail do pagador');
  assert.equal((await pay(cor)).status, 'expired', 'pendente ainda não libera');

  const id = r.j.url.split('=').pop();
  assert.equal(await hook(id, 'subscription_preapproval', false), 401, 'assinatura inválida é barrada');
  mp.subs[id].status = 'authorized'; mp.subs[id].next_payment_date = new Date(Date.now() + 30 * 864e5).toISOString();
  assert.equal(await hook(id, 'subscription_preapproval'), 200);
  const p = await pay(cor);
  assert.equal(p.status, 'active');
  assert.equal(p.renews, true);
  assert.equal((await cor.get('/api/sync')).status, 200);
  assert.equal((await cor.post('/api/billing/subscribe')).status, 409, 'já assinante');

  // cancelar: o Mercado Pago é avisado e o acesso vale até o fim do período pago
  const c = await cor.post('/api/billing/cancel');
  assert.equal(c.status, 200, c.txt);
  assert.equal(mp.subs[id].status, 'cancelled');
  assert.equal(c.j.pay.status, 'active');
  assert.equal(c.j.pay.renews, false);
  assert.equal((await cor.get('/api/sync')).status, 200);
});

test('valor novo vale para as próximas assinaturas e o aviso de pagamento também libera', async () => {
  const adm = await admin();
  await adm.post('/api/admin/billing', { trial: 0, price: '25,5' });
  const o = await signup('owner', 'bl-o4@x.com', 'Dono Preço');
  const r = await o.post('/api/billing/subscribe');
  const id = r.j.url.split('=').pop();
  assert.equal(mp.subs[id].amount, 25.5);
  mp.subs[id].status = 'authorized'; mp.subs[id].next_payment_date = new Date(Date.now() + 30 * 864e5).toISOString();
  assert.equal(await hook('pg9', 'subscription_authorized_payment'), 200);
  assert.equal((await pay(o)).status, 'active');
  // "já paguei": a consulta direta ao Mercado Pago também funciona
  const o2 = await signup('owner', 'bl-o5@x.com', 'Dono Volta');
  const id2 = (await o2.post('/api/billing/subscribe')).j.url.split('=').pop();
  mp.subs[id2].status = 'authorized'; mp.subs[id2].next_payment_date = new Date(Date.now() + 30 * 864e5).toISOString();
  assert.equal((await o2.post('/api/billing/refresh')).j.pay.status, 'active');
  await adm.post('/api/admin/billing', { price: 10 });
});

test('cortesia isenta a conta; cobrança só de proprietários deixa corretores livres; desligar libera todos', async () => {
  const adm = await admin();
  await adm.post('/api/admin/billing', { trial: 0, roles: 'both', on: true });
  const a = await signup('owner', 'bl-o6@x.com', 'Dono Cortesia');
  const b = await signup('broker', 'bl-c2@x.com', 'Corretor Livre');
  assert.equal((await a.get('/api/sync')).status, 402);
  let v = (await adm.post('/api/admin/billing/free', { email: 'bl-o6@x.com', on: true })).j;
  assert.equal(v.list.find((x) => x.email === 'bl-o6@x.com').courtesy, true);
  assert.equal((await pay(a)).status, 'free');
  assert.equal((await a.get('/api/sync')).status, 200);
  assert.equal((await adm.post('/api/admin/billing/free', { email: 'nao@existe.com', on: true })).status, 404);

  await adm.post('/api/admin/billing', { roles: 'owner' });
  assert.equal((await b.get('/api/sync')).status, 200, 'corretor fora da cobrança');
  assert.equal((await pay(b)).applies, false);
  await adm.post('/api/admin/billing', { roles: 'both', on: false });
  assert.equal((await b.get('/api/sync')).status, 200, 'cobrança desligada');
  v = (await adm.get('/api/admin/billing')).j;
  assert.equal(v.configured, true);
  assert.equal(v.hook, 'https://agenda.test/api/billing/webhook');
  assert.ok(v.list.every((x) => x.status === 'free'));
  await adm.post('/api/admin/billing', { on: true, trial: 7 });
});

test('excluir a conta cancela a assinatura no Mercado Pago', async () => {
  const adm = await admin();
  await adm.post('/api/admin/billing', { trial: 0 });
  const o = await signup('owner', 'bl-o7@x.com', 'Dono Sai');
  const id = (await o.post('/api/billing/subscribe')).j.url.split('=').pop();
  mp.subs[id].status = 'authorized'; mp.subs[id].next_payment_date = new Date(Date.now() + 30 * 864e5).toISOString();
  await o.post('/api/billing/refresh');
  assert.equal((await adm.post('/api/admin/delete-user', { email: 'bl-o7@x.com' })).status, 200);
  assert.equal(mp.subs[id].status, 'cancelled');
  await adm.post('/api/admin/billing', { trial: 7 });
});
