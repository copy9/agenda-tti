'use strict';
// Contraproposta com datas e condições, não só valor. Issue #111.
const { test, assert, db, signup, house, D } = require('./helpers');

const ptxt = async (id) => { const r = await db.one('SELECT doc FROM proposals WHERE id = ?', [id]); return JSON.parse(r.doc); };

async function setup(tag, extra) {
  const dono = await signup('owner', tag + '-d@x.com', 'Dono ' + tag);
  const a = await signup('broker', tag + '-a@x.com', 'Ana ' + tag);
  const b = await signup('broker', tag + '-b@x.com', 'Beto ' + tag);
  const hid = 'h' + tag.toUpperCase() + '1';
  await dono.sync([{ c: 'houses', up: [house(hid, extra)] }]);
  for (const [cl, em] of [[a, tag + '-a@x.com'], [b, tag + '-b@x.com']]) {
    await dono.post('/api/invites', { hid, email: em });
    const tok = (await dono.get('/api/sync')).j.view.inv[hid].find((i) => i.email === em).tok;
    assert.equal((await cl.post('/api/invites/accept', { token: tok })).status, 200);
  }
  return { dono, a, b, hid };
}
let n = 0;
const prop = (hid, x, y, v) => ({ id: 'p6' + String(++n).padStart(8, '0'), hid: 'r' + hid, in: D(x), out: D(y), value: v || 9000, guest: 'Família', pax: 4 });

test('contraproposta muda datas: a proposta do corretor só muda quando ele aceita', async () => {
  const { dono, a, hid } = await setup('cd');
  const p = prop(hid, 400, 403);
  await a.sync([{ c: 'props', up: [p] }]);
  const r = await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'countered', counter: 12000, cin: D(401), cout: D(404) }] }]);
  assert.equal(r.status, 200, r.txt);
  const d = await ptxt(p.id);
  assert.equal(d.status, 'countered');
  assert.equal(d.in, D(400), 'as datas originais ficam de pé enquanto o corretor não responde');
  assert.equal(d.cin, D(401)); assert.equal(d.cout, D(404));
  // o corretor aceita: a reserva fecha nas datas da contraproposta
  assert.equal((await a.sync([{ c: 'props', up: [{ id: p.id, status: 'accepted' }] }])).status, 200);
  const f = await ptxt(p.id);
  assert.equal(f.status, 'accepted');
  assert.equal(f.in, D(401)); assert.equal(f.out, D(404));
  assert.equal(f.final, 12000);
  assert.ok(f.cin === undefined && f.cout === undefined, 'os campos da contraproposta somem ao fechar');
  // as datas bloqueadas são as novas, não as antigas
  const bl = (await dono.get('/api/sync')).j.view.blocks[hid];
  assert.ok(bl.includes(D(401)) && bl.includes(D(403)), 'bloqueia as noites da contraproposta');
  assert.ok(!bl.includes(D(400)), 'a noite que saiu da negociação não é bloqueada');
});

test('contraproposta muda o adiantamento e ele vale na reserva', async () => {
  const { dono, a, hid } = await setup('ca');
  const p = prop(hid, 410, 413);
  await a.sync([{ c: 'props', up: [p] }]);
  assert.equal((await ptxt(p.id)).adv, 50);
  await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'countered', counter: 11000, cadv: 30 }] }]);
  assert.equal((await ptxt(p.id)).cadv, 30);
  await a.sync([{ c: 'props', up: [{ id: p.id, status: 'accepted' }] }]);
  assert.equal((await ptxt(p.id)).adv, 30, 'o adiantamento combinado passa a valer');
});

test('as datas da contraproposta passam pelas mesmas conferências de uma proposta nova', async () => {
  const { dono, a, hid } = await setup('cc');
  const p = prop(hid, 420, 423);
  await a.sync([{ c: 'props', up: [p] }]);
  // mínimo de noites da casa é 2
  const curta = await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'countered', counter: 10000, cin: D(420), cout: D(421) }] }]);
  assert.equal(curta.status, 400, curta.txt);
  // data no passado
  const velha = await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'countered', counter: 10000, cin: D(-5), cout: D(-1) }] }]);
  assert.equal(velha.status, 400);
  // datas bloqueadas de forma firme
  await dono.sync([{ c: 'blocks', up: { [hid]: [D(430), D(431)] } }]);
  const presa = await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'countered', counter: 10000, cin: D(430), cout: D(432) }] }]);
  assert.equal(presa.status, 409, presa.txt);
  assert.equal((await ptxt(p.id)).status, 'pending', 'nenhuma tentativa inválida mexeu na proposta');
});

test('recusar a contraproposta devolve a proposta original intacta', async () => {
  const { dono, a, hid } = await setup('cr');
  const p = prop(hid, 440, 443);
  await a.sync([{ c: 'props', up: [p] }]);
  await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'countered', counter: 15000, cin: D(441), cout: D(445), cadv: 70 }] }]);
  await a.sync([{ c: 'props', up: [{ id: p.id, status: 'declined' }] }]);
  const d = await ptxt(p.id);
  assert.equal(d.status, 'declined');
  assert.equal(d.in, D(440)); assert.equal(d.out, D(443));
  assert.equal(d.adv, 50, 'o adiantamento proposto não vale se a contraproposta foi recusada');
  assert.ok(d.cin === undefined && d.cadv === undefined);
});

test('duas contrapropostas para as mesmas datas novas: só a primeira aceita fecha', async () => {
  const { dono, a, b, hid } = await setup('cx');
  const p1 = prop(hid, 450, 453);
  const p2 = prop(hid, 460, 463);
  await a.sync([{ c: 'props', up: [p1] }]);
  await b.sync([{ c: 'props', up: [p2] }]);
  // o dono empurra as duas para as mesmas noites
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: p1.id, status: 'countered', counter: 10000, cin: D(470), cout: D(473) }] }])).status, 200);
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: p2.id, status: 'countered', counter: 11000, cin: D(470), cout: D(473) }] }])).status, 200);
  assert.equal((await a.sync([{ c: 'props', up: [{ id: p1.id, status: 'accepted' }] }])).status, 200);
  const segundo = await b.sync([{ c: 'props', up: [{ id: p2.id, status: 'accepted' }] }]);
  assert.ok(segundo.status === 409 || (await ptxt(p2.id)).status !== 'accepted', 'a segunda não pode fechar nas mesmas noites');
});

test('contraproposta sem datas continua funcionando como antes', async () => {
  const { dono, a, hid } = await setup('cs');
  const p = prop(hid, 480, 483);
  await a.sync([{ c: 'props', up: [p] }]);
  await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'countered', counter: 9500 }] }]);
  const d = await ptxt(p.id);
  assert.equal(d.counter, 9500);
  assert.ok(d.cin === undefined && d.cout === undefined && d.cadv === undefined);
  await a.sync([{ c: 'props', up: [{ id: p.id, status: 'accepted' }] }]);
  const f = await ptxt(p.id);
  assert.equal(f.in, D(480)); assert.equal(f.out, D(483)); assert.equal(f.final, 9500);
});
