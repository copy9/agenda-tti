'use strict';
const { test, assert, signup, house, Client } = require('./helpers');

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

test('perfil público do corretor lista só as casas em que ele foi convidado, sem dados de terceiros', async () => {
  const d1 = await signup('owner', 'pf-d1@x.com', 'Dono Perfil Um');
  const d2 = await signup('owner', 'pf-d2@x.com', 'Dono Perfil Dois');
  const cor = await signup('broker', 'pf-c1@x.com', 'Corretor Perfil');
  const outro = await signup('broker', 'pf-c2@x.com', 'Outro Corretor');
  await d1.sync([{ c: 'houses', up: [house('hPF1', { name: 'Casa Aceita' }), house('hPF2', { name: 'Casa Pendente' })] }]);
  await d2.sync([{ c: 'houses', up: [house('hPF3', { name: 'Casa Do Outro' })] }]);
  const tok = async (o, hid, email) => (await o.post('/api/invites', { hid, email })).j && (await o.get('/api/sync')).j.view.inv[hid].find((i) => i.email === email).tok;
  assert.equal((await cor.post('/api/invites/accept', { token: await tok(d1, 'hPF1', 'pf-c1@x.com') })).status, 200);
  await tok(d1, 'hPF2', 'pf-c1@x.com'); // convite ainda não aceito
  assert.equal((await outro.post('/api/invites/accept', { token: await tok(d2, 'hPF3', 'pf-c2@x.com') })).status, 200);
  const code = (await cor.get('/api/session')).j.user.code;
  const r = await new Client().get('/api/public/broker/' + code);
  assert.equal(r.status, 200);
  assert.equal(r.j.bn, 'Corretor Perfil');
  assert.deepEqual(r.j.hs.map((h) => h.n), ['Casa Aceita']);
  const txt = JSON.stringify(r.j);
  for (const n of ['pf-d1@x.com', 'Dono Perfil', 'Outro Corretor', 'pf-c2@x.com', 'Casa Do Outro', 'Casa Pendente']) assert.ok(!txt.includes(n), 'vazou ' + n);
  assert.equal((await new Client().get('/api/public/broker/00000000')).status, 404);
  assert.equal((await new Client().get('/api/public/broker/xx')).status, 404);
});

test('dados opcionais do corretor (cidades, CRECI, bio) aparecem no perfil público e só o próprio corretor edita', async () => {
  const cor = await signup('broker', 'bio-c1@x.com', 'Corretor Bio');
  const dono = await signup('owner', 'bio-d1@x.com', 'Dono Bio');
  const code = (await cor.get('/api/session')).j.user.code;
  const vazio = await new Client().get('/api/public/broker/' + code);
  assert.deepEqual([vazio.j.c, vazio.j.r, vazio.j.bi], ['', '', '']);
  await cor.sync([{ c: 'bio', set: { 'bio-c1@x.com': { c: ' Xangri-lá, Capão da Canoa ', r: 'CRECI 12345-F', b: 'x'.repeat(900) } } }]);
  const r = await new Client().get('/api/public/broker/' + code);
  assert.equal(r.j.c, 'Xangri-lá, Capão da Canoa');
  assert.equal(r.j.r, 'CRECI 12345-F');
  assert.equal(r.j.bi.length, 600);
  assert.equal((await cor.get('/api/sync')).j.view.bio['bio-c1@x.com'].r, 'CRECI 12345-F');
  // outro usuário não consegue gravar no perfil alheio, nem o proprietário grava como corretor
  await dono.sync([{ c: 'bio', set: { 'bio-c1@x.com': { c: 'hack', r: 'hack', b: 'hack' } } }]);
  assert.equal((await new Client().get('/api/public/broker/' + code)).j.c, 'Xangri-lá, Capão da Canoa');
});
