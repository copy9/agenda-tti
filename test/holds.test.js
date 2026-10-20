'use strict';
const { test, assert, db, signup, house, D } = require('./helpers');
const S = require('../src/store');

const ptxt = async (id) => { const r = await db.one('SELECT doc FROM proposals WHERE id = ?', [id]); return JSON.parse(r.doc); };
const setDoc = async (id, fn) => { const d = await ptxt(id); fn(d); await db.run('UPDATE proposals SET doc = ? WHERE id = ?', [JSON.stringify(d), id]); };
const sweep = () => db.write((t) => S.expireDue(t));

async function setup(tag, houseExtra) {
  const dono = await signup('owner', tag + '-d@x.com', 'Dono ' + tag);
  const a = await signup('broker', tag + '-a@x.com', 'Ana ' + tag);
  const b = await signup('broker', tag + '-b@x.com', 'Beto ' + tag);
  const hid = 'h' + tag.toUpperCase() + '1';
  await dono.sync([{ c: 'houses', up: [house(hid, houseExtra)] }]);
  for (const [c, e] of [[a, tag + '-a@x.com'], [b, tag + '-b@x.com']]) {
    await dono.post('/api/invites', { hid, email: e });
    const tok = (await dono.get('/api/sync')).j.view.inv[hid].find((i) => i.email === e).tok;
    assert.equal((await c.post('/api/invites/accept', { token: tok })).status, 200);
  }
  return { dono, a, b, hid };
}
let n = 0;
const prop = (hid, a, b, id) => ({ id: id || 'p8' + String(++n).padStart(8, '0'), hid: 'r' + hid, in: D(a), out: D(b), value: 9000, guest: 'Família', pax: 4 });

test('prazo da casa: padrão 24h, configurável por imóvel e limitado', async () => {
  const { dono, a, hid } = await setup('hd');
  const h0 = (await dono.get('/api/sync')).j.view.houses[0];
  assert.equal(h0.hold, 24); assert.equal(h0.advH, 24);
  const p = prop(hid, 30, 33);
  await a.sync([{ c: 'props', up: [p] }]);
  const d = await ptxt(p.id);
  assert.ok(Math.abs(d.exp - (Date.now() + 24 * 36e5)) < 6e4);
  await dono.sync([{ c: 'houses', up: [house(hid, { hold: 12, advH: 48 })] }]);
  const h1 = (await dono.get('/api/sync')).j.view.houses[0];
  assert.equal(h1.hold, 12); assert.equal(h1.advH, 48);
  await dono.sync([{ c: 'houses', up: [house(hid, { hold: 1, advH: 9999 })] }]);
  const h2 = (await dono.get('/api/sync')).j.view.houses[0];
  assert.equal(h2.hold, 6); assert.equal(h2.advH, 168);
});

test('interesse: não bloqueia, é anônimo para outros corretores e expira', async () => {
  const { dono, a, b, hid } = await setup('it');
  const r = await a.sync([{ c: 'ints', up: [{ hid: 'r' + hid, in: D(40), out: D(43) }] }]);
  assert.equal(r.status, 200, r.txt);
  const mine = r.j.view.ints;
  assert.equal(mine.length, 1); assert.equal(mine[0].mine, 1);
  const seen = (await b.get('/api/sync')).j;
  assert.equal(seen.view.ints.length, 1); assert.equal(seen.view.ints[0].mine, 0);
  assert.ok(!JSON.stringify(seen).includes('it-a@x.com') && !JSON.stringify(seen).includes('Ana it'));
  assert.deepEqual(Object.keys(seen.view.ints[0]).sort(), ['exp', 'hid', 'id', 'in', 'mine', 'out']);
  // o proprietário não vê interesses
  assert.ok(!(await dono.get('/api/sync')).j.view.ints);
  // outro corretor pode propor nas mesmas datas (interesse não bloqueia)
  assert.equal((await b.sync([{ c: 'props', up: [prop(hid, 40, 43)] }])).status, 200);
  // a proposta do mesmo corretor consome o interesse dele
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 40, 43)] }])).status, 200);
  assert.equal((await a.get('/api/sync')).j.view.ints.length, 0);
  // expira
  await a.sync([{ c: 'ints', up: [{ hid: 'r' + hid, in: D(50), out: D(52) }] }]);
  await db.run('UPDATE interests SET exp = ?', [Date.now() - 1]);
  await sweep();
  assert.equal((await a.get('/api/sync')).j.view.ints.length, 0);
  // validações
  assert.equal((await a.sync([{ c: 'ints', up: [{ hid: 'r' + hid, in: D(-3), out: D(-1) }] }])).status, 400);
  assert.equal((await a.sync([{ c: 'ints', up: [{ hid: 'r' + hid, in: D(60), out: D(90) }] }])).status, 400);
  assert.equal((await dono.sync([{ c: 'ints', up: [{ hid, in: D(60), out: D(62) }] }])).status, 200); // proprietário é ignorado
});

test('fila: segunda proposta nas mesmas datas fica invisível ao dono e é promovida quando libera', async () => {
  const { dono, a, b, hid } = await setup('fl');
  const p1 = prop(hid, 70, 73); const p2 = prop(hid, 71, 74);
  assert.equal((await a.sync([{ c: 'props', up: [p1] }])).status, 200);
  const q = await b.sync([{ c: 'props', up: [p2] }]);
  assert.equal(q.status, 200, q.txt);
  assert.equal((await ptxt(p2.id)).q, 1);
  assert.equal((await dono.get('/api/sync')).j.view.props.length, 1);
  // o dono não consegue agir sobre a fila
  assert.equal((await dono.sync([{ c: 'props', up: [{ id: p2.id, status: 'accepted' }] }])).status, 409);
  // o corretor da fila não aparece como "data segurada" para outros
  assert.equal((await a.get('/api/sync')).j.view.props.filter((x) => x.ghost).length, 0);
  // o dono recusa a primeira: a fila anda
  await dono.sync([{ c: 'props', up: [{ id: p1.id, status: 'rejected' }] }]);
  const d2 = await ptxt(p2.id);
  assert.ok(!d2.q); assert.ok(d2.exp > Date.now());
  assert.equal((await dono.get('/api/sync')).j.view.props.filter((x) => x.id === p2.id).length, 1);
});

test('fila: lotada recusa e aceite encerra quem esperava', async () => {
  const { dono, a, b, hid } = await setup('fq');
  const c = await signup('broker', 'fq-c@x.com', 'Caio fq');
  const e = await signup('broker', 'fq-e@x.com', 'Eva fq');
  const f = await signup('broker', 'fq-f@x.com', 'Fabi fq');
  for (const [cl, em] of [[c, 'fq-c@x.com'], [e, 'fq-e@x.com'], [f, 'fq-f@x.com']]) {
    await dono.post('/api/invites', { hid, email: em });
    const tok = (await dono.get('/api/sync')).j.view.inv[hid].find((i) => i.email === em).tok;
    await cl.post('/api/invites/accept', { token: tok });
  }
  const first = prop(hid, 80, 83);
  assert.equal((await a.sync([{ c: 'props', up: [first] }])).status, 200);
  assert.equal((await b.sync([{ c: 'props', up: [prop(hid, 80, 83)] }])).status, 200);
  assert.equal((await c.sync([{ c: 'props', up: [prop(hid, 80, 83)] }])).status, 200);
  assert.equal((await e.sync([{ c: 'props', up: [prop(hid, 80, 83)] }])).status, 200);
  assert.equal((await f.sync([{ c: 'props', up: [prop(hid, 80, 83)] }])).status, 409);
  await dono.sync([{ c: 'props', up: [{ id: first.id, status: 'accepted' }] }]);
  const all = await db.all("SELECT status FROM proposals WHERE house_id = ? AND id <> ?", [hid, first.id]);
  assert.ok(all.every((r) => r.status === 'rejected'));
});

test('reserva sem adiantamento no prazo é liberada, as datas voltam e o corretor ganha ocorrência', async () => {
  const { dono, a, b, hid } = await setup('ad');
  const p = prop(hid, 90, 93);
  await a.sync([{ c: 'props', up: [p] }]);
  await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'accepted' }] }]);
  assert.ok((await ptxt(p.id)).acc > 0);
  // dentro do prazo: nada acontece
  await sweep();
  assert.equal((await ptxt(p.id)).status, 'accepted');
  // fora do prazo e sem pagamento informado: libera
  await setDoc(p.id, (d) => { d.acc = Date.now() - 25 * 36e5; });
  await sweep();
  const d = await ptxt(p.id);
  assert.equal(d.status, 'expired'); assert.equal(d.rel, 'adv');
  assert.ok(!((await dono.get('/api/sync')).j.view.blocks[hid] || []).includes(D(90)));
  const v = (await dono.get('/api/sync')).j.view;
  assert.equal(v.flags['ad-a@x.com'].n, 1); assert.equal(v.flags['ad-a@x.com'].mine, 1);
  assert.equal((await a.get('/api/sync')).j.view.flag.n, 1);
  // outro corretor já pode pegar as datas
  assert.equal((await b.sync([{ c: 'props', up: [prop(hid, 90, 93)] }])).status, 200);
  // quem informou o adiantamento não é liberado
  const p2 = prop(hid, 100, 103);
  await b.sync([{ c: 'props', up: [p2] }]);
  await dono.sync([{ c: 'props', up: [{ id: p2.id, status: 'accepted' }] }]);
  await b.sync([{ c: 'props', up: [{ id: p2.id, pay: true }] }]);
  await setDoc(p2.id, (x) => { x.acc = Date.now() - 80 * 36e5; });
  await sweep();
  assert.equal((await ptxt(p2.id)).status, 'accepted');
});

test('prazo do adiantamento respeita a configuração da casa', async () => {
  const { dono, a, hid } = await setup('a2', { advH: 72 });
  const p = prop(hid, 110, 113);
  await a.sync([{ c: 'props', up: [p] }]);
  await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'accepted' }] }]);
  await setDoc(p.id, (d) => { d.acc = Date.now() - 48 * 36e5; });
  await sweep();
  assert.equal((await ptxt(p.id)).status, 'accepted');
  await setDoc(p.id, (d) => { d.acc = Date.now() - 73 * 36e5; });
  await sweep();
  assert.equal((await ptxt(p.id)).status, 'expired');
});

test('limites por corretor: 3 propostas abertas, 1 com 2 ocorrências, bloqueado com 3', async () => {
  const { a, hid } = await setup('lm');
  for (let i = 0; i < 3; i++) assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 120 + i * 5, 123 + i * 5)] }])).status, 200);
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 150, 153)] }])).status, 409);
  await db.run("UPDATE proposals SET status = 'cancelled' WHERE broker_email = 'lm-a@x.com'");
  const strike = (k) => db.run('INSERT INTO strikes (id, broker_email, owner_email, house_id, kind, pid, at) VALUES (?,?,?,?,?,?,?)', ['s' + Math.random(), 'lm-a@x.com', 'lm-d@x.com', hid, k, '', Date.now()]);
  await strike('advance'); await strike('advance');
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 160, 163)] }])).status, 200);
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 170, 173)] }])).status, 409);
  await db.run("UPDATE proposals SET status = 'cancelled' WHERE broker_email = 'lm-a@x.com'");
  await strike('advance');
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 180, 183)] }])).status, 403);
  // ocorrências antigas deixam de valer
  await db.run('UPDATE strikes SET at = ?', [Date.now() - 100 * 864e5]);
  assert.equal((await a.sync([{ c: 'props', up: [prop(hid, 190, 193)] }])).status, 200);
});

test('contraproposta ignorada gera ocorrência; flag é visível ao dono e ao próprio corretor, não a outros', async () => {
  const { dono, a, b, hid } = await setup('fg');
  const p = prop(hid, 200, 203);
  await a.sync([{ c: 'props', up: [p] }]);
  await dono.sync([{ c: 'props', up: [{ id: p.id, status: 'countered', counter: 8000 }] }]);
  await setDoc(p.id, (d) => { d.exp = Date.now() - 1; });
  await sweep();
  assert.equal((await ptxt(p.id)).status, 'expired');
  assert.equal((await dono.get('/api/sync')).j.view.flags['fg-a@x.com'].n, 1);
  const bj = JSON.stringify((await b.get('/api/sync')).j);
  assert.ok(!bj.includes('"flag":{') && !bj.includes('flags'), 'corretor B não vê ocorrências de A');
  // proposta do dono sem resposta NÃO é ocorrência do corretor
  const p2 = prop(hid, 210, 213);
  await b.sync([{ c: 'props', up: [p2] }]);
  await setDoc(p2.id, (d) => { d.exp = Date.now() - 1; });
  await sweep();
  assert.equal((await ptxt(p2.id)).status, 'expired');
  assert.ok(!(await dono.get('/api/sync')).j.view.flags['fg-b@x.com']);
});
