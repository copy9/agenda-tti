'use strict';
const { test, assert, signup, house } = require('./helpers');

test('proprietário só vê os corretores que convidou, com proposta ou conversa', async () => {
  const dono = await signup('owner', 'dono@x.com', 'Dono Um');
  const outro = await signup('owner', 'outro@x.com', 'Outro Dono');
  await signup('broker', 'convidado@x.com', 'Corretor Convidado');
  await signup('broker', 'estranho@x.com', 'Corretor Estranho');
  await signup('broker', 'doutro@x.com', 'Corretor Do Outro');

  await dono.sync([{ c: 'houses', up: [house('hOW1')] }]);
  await outro.sync([{ c: 'houses', up: [house('hOW2')] }]);
  assert.equal((await dono.post('/api/invites', { hid: 'hOW1', email: 'convidado@x.com' })).status, 200);
  assert.equal((await outro.post('/api/invites', { hid: 'hOW2', email: 'doutro@x.com' })).status, 200);

  const v = (await dono.get('/api/sync')).j.view;
  assert.deepEqual(Object.keys(v.brokers), ['convidado@x.com']);
  const txt = JSON.stringify(v);
  for (const n of ['estranho@x.com', 'Corretor Estranho', 'doutro@x.com', 'Corretor Do Outro']) assert.ok(!txt.includes(n), 'vazou ' + n);
  assert.ok(!JSON.stringify((await outro.get('/api/sync')).j.view).includes('convidado@x.com'));
});

test('itens do check-in e check-out: só o proprietário decide e o corretor recebe a escolha dele', async () => {
  const dono = await signup('owner', 'ck-dono@x.com', 'Dono Check');
  const cor = await signup('broker', 'ck-cor@x.com', 'Corretor Check');
  await dono.sync([{ c: 'houses', up: [house('hCK1', { ckoff: ['ci:i1', 'co:t', 'xx', '<b>'] })] }]);
  assert.equal((await dono.post('/api/invites', { hid: 'hCK1', email: 'ck-cor@x.com' })).status, 200);
  const tok = (await dono.get('/api/sync')).j.view.inv.hCK1[0].tok;
  assert.equal((await cor.post('/api/invites/accept', { token: tok })).status, 200);
  const doDono = (await dono.get('/api/sync')).j.view.houses.find((h) => h.id === 'hCK1');
  assert.deepEqual(doDono.ckoff, ['ci:i1', 'co:t'], 'lixo é descartado');
  const doCor = (await cor.get('/api/sync')).j.view.brokers['ck-cor@x.com'].houses.find((h) => h.id === 'rhCK1');
  assert.deepEqual(doCor.ckoff, ['ci:i1', 'co:t']);
  // salvar a casa de novo sem o campo não apaga a escolha
  await dono.sync([{ c: 'houses', up: [house('hCK1', { name: 'Casa Nova' })] }]);
  const d2 = (await dono.get('/api/sync')).j.view.houses.find((h) => h.id === 'hCK1');
  assert.equal(d2.name, 'Casa Nova'); assert.deepEqual(d2.ckoff, ['ci:i1', 'co:t']);
});
