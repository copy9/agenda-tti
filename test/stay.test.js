'use strict';
const { test, assert, signup, house, Client } = require('./helpers');

const D = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('fluxo da reserva: adiantamento informado e confirmado, página de check-in e link público', async () => {
  const dono = await signup('owner', 'st-d@x.com', 'Dono Estadia');
  const cor = await signup('broker', 'st-c@x.com', 'Corretor Estadia');
  const outro = await signup('broker', 'st-o@x.com', 'Outro Corretor');
  await dono.sync([{ c: 'houses', up: [house('hST1', { name: 'Casa da Estadia', cit: '14:00', acc: 'Chaves com o zelador' })] }]);
  const tk = async (e) => (await dono.post('/api/invites', { hid: 'hST1', email: e })).j && (await dono.get('/api/sync')).j.view.inv.hST1.find((i) => i.email === e).tok;
  assert.equal((await cor.post('/api/invites/accept', { token: await tk('st-c@x.com') })).status, 200);
  const prop = { id: 'p900000001', hid: 'hST1', in: D(20), out: D(23), value: 9000, guest: 'Família Teste', pax: 4 };
  assert.equal((await cor.sync([{ c: 'props', up: [prop] }])).status, 200);
  const acc = await dono.sync([{ c: 'props', up: [{ id: 'p900000001', status: 'accepted' }] }]);
  assert.equal(acc.status, 200, acc.txt);
  const p = () => dono.get('/api/sync').then((r) => r.j.view.props.find((x) => x.id === 'p900000001'));
  const tok = (await p()).tok;
  assert.match(tok, /^[a-f0-9]{16}$/);

  // página ainda não enviada: o hóspede vê só o aviso
  let pub = await new Client().get('/api/public/stay/' + tok);
  assert.equal(pub.status, 200);
  assert.equal(pub.j.ready, false);
  assert.ok(!JSON.stringify(pub.j).includes('zelador'));

  // corretor informa o pagamento; o proprietário não pode informar nem o corretor confirmar
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: 'p900000001', pay: true }] }])).status, 403);
  assert.equal((await cor.sync([{ c: 'props', up: [{ id: 'p900000001', paid: true }] }])).status, 403);
  assert.equal((await outro.sync([{ c: 'props', up: [{ id: 'p900000001', pay: true }] }])).status, 200); // ignorado: não é o corretor da reserva
  assert.ok(!(await p()).pay);
  assert.equal((await cor.sync([{ c: 'props', up: [{ id: 'p900000001', pay: true, payRef: 'PIX 10/10' }] }])).status, 200);
  const informed = await p();
  assert.ok(informed.pay > 0);
  assert.equal(informed.payRef, 'PIX 10/10');
  assert.ok(!informed.paid);
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: 'p900000001', paid: true }] }])).status, 200);
  const paid = await p();
  assert.equal(paid.paid, true);
  assert.ok(paid.paidAt > 0);

  // só o proprietário preenche a página; horário inválido é ignorado; o texto é limitado
  assert.equal((await cor.sync([{ c: 'props', up: [{ id: 'p900000001', ck: { t: '16:00' } }] }])).status, 403);
  const ck = { t: '16:30', k: '25:99', a: 'Portaria 2, senha 1234', w: 'CasaWifi', p: 'senha123', ph: 'Zelador: (51) 99999-1111', n: 'x'.repeat(2000) };
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: 'p900000001', ck }] }])).status, 200);
  const saved = (await p()).ck;
  assert.equal(saved.t, '16:30');
  assert.equal(saved.k, '');
  assert.equal(saved.n.length, 800);
  assert.ok(!saved.s);
  pub = await new Client().get('/api/public/stay/' + tok);
  assert.equal(pub.j.ready, false, 'não enviado ainda');

  // enviar ao corretor libera a página pública, com os dados da casa preenchidos sozinhos
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: 'p900000001', ck: Object.assign({}, ck, { k: '12:00', s: 1 }) }] }])).status, 200);
  const sent = (await cor.get('/api/sync')).j.view.props.find((x) => x.id === 'p900000001');
  assert.ok(sent.ck.s > 0);
  pub = await new Client().get('/api/public/stay/' + tok);
  assert.equal(pub.j.ready, true);
  assert.equal(pub.j.hn, 'Casa da Estadia');
  assert.equal(pub.j.t, '16:30');
  assert.equal(pub.j.k, '12:00');
  assert.equal(pub.j.a, 'Portaria 2, senha 1234');
  assert.equal(pub.j.g, 'Família Teste');
  assert.equal(pub.j.bn, 'Corretor Estadia');
  const txt = JSON.stringify(pub.j);
  for (const n of ['st-d@x.com', 'st-c@x.com', 'st-o@x.com', 'Outro Corretor']) assert.ok(!txt.includes(n), 'vazou ' + n);

  // telefones úteis: sem o que o proprietário digitou, vale o cadastro da casa
  await dono.sync([{ c: 'houses', up: [house('hST1', { name: 'Casa da Estadia', cit: '14:00', acc: 'Chaves com o zelador', ph: 'Zelador da casa: (51) 98888-0000' })] }]);
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: 'p900000001', ck: Object.assign({}, ck, { k: '12:00', s: 1, ph: '' }) }] }])).status, 200);
  pub = await new Client().get('/api/public/stay/' + tok);
  assert.equal(pub.j.ph, 'Zelador da casa: (51) 98888-0000');

  // código inválido ou de reserva não aceita
  assert.equal((await new Client().get('/api/public/stay/0000000000000000')).status, 404);
  assert.equal((await new Client().get('/api/public/stay/xx')).status, 404);
});
