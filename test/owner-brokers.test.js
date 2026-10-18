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

test('corretor edita o nome e envia foto; foto inválida é recusada e o perfil público mostra os dois', async () => {
  const cor = await signup('broker', 'ft-c1@x.com', 'Nome Antigo');
  const code = (await cor.get('/api/session')).j.user.code;
  const foto = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  await cor.sync([{ c: 'bio', set: { 'ft-c1@x.com': { n: 'Nome Novo', c: 'Torres', r: '', b: '', p: foto } } }]);
  let r = await new Client().get('/api/public/broker/' + code);
  assert.equal(r.j.bn, 'Nome Novo');
  assert.equal(r.j.av, foto);
  // sem o campo p, a foto atual é mantida; com p vazio, é removida
  await cor.sync([{ c: 'bio', set: { 'ft-c1@x.com': { n: 'Nome Novo', c: 'Torres', r: '', b: '' } } }]);
  assert.equal((await new Client().get('/api/public/broker/' + code)).j.av, foto);
  const ruim = await cor.post('/api/sync', { ops: [{ c: 'bio', set: { 'ft-c1@x.com': { n: 'Nome Novo', p: 'data:text/html;base64,PHNjcmlwdD4=' } } }] });
  assert.equal(ruim.status, 400);
  const curto = await cor.post('/api/sync', { ops: [{ c: 'bio', set: { 'ft-c1@x.com': { n: 'A' } } }] });
  assert.equal(curto.status, 400);
  await cor.sync([{ c: 'bio', set: { 'ft-c1@x.com': { n: 'Nome Novo', p: '' } } }]);
  r = await new Client().get('/api/public/broker/' + code);
  assert.equal(r.j.av, '');
  assert.equal(r.j.bn, 'Nome Novo');
});

test('perfil público: o corretor escolhe as casas e a ordem; sem escolha, das mais locadas para as menos', async () => {
  const d = await signup('owner', 'sel-d@x.com', 'Dono Sel');
  const cor = await signup('broker', 'sel-c@x.com', 'Corretor Sel');
  await d.sync([{ c: 'houses', up: [house('hSL1', { name: 'Casa A', rate: 1000 }), house('hSL2', { name: 'Casa B', rate: 3000 }), house('hSL3', { name: 'Casa C', rate: 2000 })] }]);
  for (const hid of ['hSL1', 'hSL2', 'hSL3']) {
    await d.post('/api/invites', { hid, email: 'sel-c@x.com' });
    const tok = (await d.get('/api/sync')).j.view.inv[hid].find((i) => i.email === 'sel-c@x.com').tok;
    assert.equal((await cor.post('/api/invites/accept', { token: tok })).status, 200);
  }
  const code = (await cor.get('/api/session')).j.user.code;
  const nomes = async () => (await new Client().get('/api/public/broker/' + code)).j.hs.map((h) => h.n);
  // Casa C tem uma locação aceita: vai primeiro.
  const agora = Date.now();
  await cor.sync([{ c: 'props', up: [{ id: 'p910000001', hid: 'rhSL3', house: 'Casa C', broker: 'sel-c@x.com', bname: 'Corretor Sel', in: '2031-03-10', out: '2031-03-13', value: 6000, guest: 'G', pax: 2, msg: '', status: 'pending', at: '2026-10-18', log: [], exp: agora + 864e5 }] }]);
  await d.sync([{ c: 'props', up: [{ id: 'p910000001', status: 'accepted', final: 6000 }] }]);
  assert.deepEqual(await nomes(), ['Casa C', 'Casa A', 'Casa B']);
  await cor.sync([{ c: 'bio', set: { 'sel-c@x.com': { o: 'hi' } } }]);
  assert.deepEqual(await nomes(), ['Casa B', 'Casa C', 'Casa A']);
  await cor.sync([{ c: 'bio', set: { 'sel-c@x.com': { o: 'lo', hs: ['hSL2', 'hSL1', 'lixo!', 'hOUTRA'] } } }]);
  assert.deepEqual(await nomes(), ['Casa A', 'Casa B']);
  await cor.sync([{ c: 'bio', set: { 'sel-c@x.com': { hs: [] } } }]);
  assert.deepEqual(await nomes(), ['Casa A', 'Casa C', 'Casa B'], 'sem casas marcadas, aparecem todas');
});
