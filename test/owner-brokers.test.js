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
