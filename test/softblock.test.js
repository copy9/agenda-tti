'use strict';
// Bloqueio do proprietário: firme (indistinguível de data vendida) ou negociável (aceita proposta). Issue #110.
const { test, assert, db, signup, house, D } = require('./helpers');

async function setup(tag) {
  const dono = await signup('owner', tag + '-d@x.com', 'Dono ' + tag);
  const a = await signup('broker', tag + '-a@x.com', 'Ana ' + tag);
  const hid = 'h' + tag.toUpperCase() + '1';
  await dono.sync([{ c: 'houses', up: [house(hid)] }]);
  await dono.post('/api/invites', { hid, email: tag + '-a@x.com' });
  const tok = (await dono.get('/api/sync')).j.view.inv[hid].find((i) => i.email === tag + '-a@x.com').tok;
  assert.equal((await a.post('/api/invites/accept', { token: tok })).status, 200);
  return { dono, a, hid };
}
let n = 0;
const prop = (hid, x, y) => ({ id: 'p7' + String(++n).padStart(8, '0'), hid: 'r' + hid, in: D(x), out: D(y), value: 9000, guest: 'Família', pax: 4 });
const soft = (t, hid) => db.write((tx) => require('../src/store').readSoft(tx, hid));

test('bloqueio firme barra proposta e interesse, como sempre barrou', async () => {
  const { dono, a, hid } = await setup('bf');
  assert.equal((await dono.sync([{ c: 'blocks', up: { [hid]: [D(300), D(301), D(302)] } }])).status, 200);
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 300, 303)] }])).status, 409);
  assert.equal((await a.sync([{ c: 'ints', up: [{ id: 'if1', hid: 'r' + hid, in: D(300), out: D(303) }] }])).status, 409);
});

test('bloqueio negociável aceita proposta e interesse', async () => {
  const { dono, a, hid } = await setup('bn');
  const r = await dono.sync([{ c: 'blocks', up: { [hid]: { d: [D(310), D(311), D(312)], s: [D(310), D(311), D(312)] } } }]);
  assert.equal(r.status, 200, r.txt);
  assert.deepEqual(await soft(null, hid), [D(310), D(311), D(312)]);
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 310, 313)] }])).status, 200);
  assert.equal((await a.sync([{ c: 'ints', up: [{ id: 'in1', hid: 'r' + hid, in: D(311), out: D(313) }] }])).status, 200);
});

test('o corretor recebe o negociável à parte e o firme continua indistinguível', async () => {
  const { dono, a, hid } = await setup('bv');
  await dono.sync([{ c: 'blocks', up: { [hid]: { d: [D(320), D(321)], s: [D(321)] } } }]);
  const v = (await a.get('/api/sync')).j.view;
  const casa = v.brokers[Object.keys(v.brokers)[0]].houses.find((h) => h.id === 'r' + hid);
  assert.deepEqual(casa.blocked, [D(320)], 'só o firme entra em blocked');
  assert.deepEqual(casa.soft, [D(321)], 'o negociável vem marcado à parte');
  assert.deepEqual(v.blocks[hid], [D(320)], 'o mapa de bloqueios do corretor não revela o negociável como firme');
  // o dono enxerga os dois conjuntos
  const vo = (await dono.get('/api/sync')).j.view;
  assert.deepEqual(vo.blocks[hid], [D(320), D(321)]);
  assert.deepEqual(vo.soft[hid], [D(321)]);
});

test('aceitar em data negociável fecha a reserva e a data vira firme', async () => {
  const { dono, a, hid } = await setup('ba');
  await dono.sync([{ c: 'blocks', up: { [hid]: { d: [D(330), D(331), D(332)], s: [D(330), D(331), D(332)] } } }]);
  const p = prop(hid, 330, 333);
  assert.equal((await a.sync([{ c: 'props', up: [p] }])).status, 200);
  // aceita direto, sem precisar liberar o bloqueio antes
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'accepted' }] }])).status, 200);
  assert.deepEqual(await soft(null, hid), [], 'as noites vendidas deixam de ser negociáveis');
  const v = (await a.get('/api/sync')).j.view;
  const casa = v.brokers[Object.keys(v.brokers)[0]].houses.find((h) => h.id === 'r' + hid);
  assert.deepEqual(casa.soft, [], 'nada negociável sobra sobre a reserva fechada');
  assert.ok([D(330), D(331), D(332)].every((d) => casa.blocked.includes(d)), 'as datas viram bloqueio firme');
});

test('data vendida não pode ser marcada como negociável', async () => {
  const { dono, a, hid } = await setup('bz');
  const p = prop(hid, 340, 343);
  await a.sync([{ c: 'props', up: [p] }]);
  await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'accepted' }] }]);
  const vendidas = [D(340), D(341), D(342)];
  assert.equal((await dono.sync([{ c: 'blocks', up: { [hid]: { d: vendidas, s: vendidas } } }])).status, 200);
  assert.deepEqual(await soft(null, hid), [], 'o pedido é ignorado sobre data vendida');
  // e ninguém consegue propor nelas
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 340, 343)] }])).status, 409);
});

test('negociável é permitido sobre proposta em aberto; firme não', async () => {
  const { dono, a, hid } = await setup('bp');
  const p = prop(hid, 350, 353);
  await a.sync([{ c: 'props', up: [p] }]);
  const nights = [D(350), D(351), D(352)];
  assert.equal((await dono.sync([{ c: 'blocks', up: { [hid]: { d: nights, s: nights } } }])).status, 200);
  assert.equal((await dono.sync([{ c: 'blocks', up: { [hid]: { d: nights, s: [] } } }])).status, 409, 'firme sobre proposta em aberto continua barrado');
});

test('lista solta continua funcionando e preserva o que já era negociável', async () => {
  const { dono, hid } = await setup('bl');
  await dono.sync([{ c: 'blocks', up: { [hid]: { d: [D(360), D(361)], s: [D(361)] } } }]);
  assert.equal((await dono.sync([{ c: 'blocks', up: { [hid]: [D(360), D(361), D(362)] } } ])).status, 200);
  assert.deepEqual(await soft(null, hid), [D(361)], 'o formato antigo não apaga a marcação existente');
  // tirar a data do bloqueio também tira do negociável
  await dono.sync([{ c: 'blocks', up: { [hid]: [D(360)] } }]);
  assert.deepEqual(await soft(null, hid), []);
});
