'use strict';
// Regras de gravação: o que cada perfil pode criar ou alterar. Tudo que não está aqui é ignorado ou recusado.
const cfg = require('./config');
const U = require('./util');
const S = require('./store');

const H48 = 48 * 36e5;
const forbid = (m = 'Você não tem permissão para essa ação.') => U.bad(m, 403);
const conflict = (m) => U.bad(m, 409);

// ---------- casas (proprietário) ----------
async function houses(t, user, op) {
  if (user.role !== 'owner') return;
  for (const inc of (op.up || [])) {
    if (!inc || typeof inc.id !== 'string' || !/^[A-Za-z][A-Za-z0-9]{2,38}$/.test(inc.id)) continue;
    const row = await S.one(t, 'SELECT * FROM houses WHERE id = ?', [inc.id]);
    if (row && row.owner_email !== user.email) throw forbid('Esta casa pertence a outro proprietário.');
    const prev = row ? U.parse(row.doc, {}) : null;
    if (!row) {
      const n = await S.one(t, 'SELECT COUNT(*) AS n FROM houses WHERE owner_email = ?', [user.email]);
      if (Number(n.n) >= cfg.MAX_HOUSES_PER_OWNER) throw U.bad('Limite de casas atingido.', 409);
    }
    const doc = S.cleanHouse(inc, prev);
    if (!doc.name) throw U.bad('Informe o nome da casa.');
    doc.photos = await S.savePhotos(t, inc.id, inc.photos === undefined && prev ? prev.photos : inc.photos);
    doc.cap = (Array.isArray(inc.cap) ? inc.cap : (prev && prev.cap) || []).slice(0, doc.photos.length).map((c) => S.safe(c, 120));
    const j = JSON.stringify(doc);
    if (row) await t.run('UPDATE houses SET doc = ?, updated = ? WHERE id = ?', [j, Date.now(), inc.id]);
    else await t.run('INSERT INTO houses (id, owner_email, slug, doc, updated) VALUES (?,?,?,?,?)', [inc.id, user.email, await S.newSlug(t), j, Date.now()]);
  }
  for (const id of (op.del || [])) {
    const row = await S.one(t, 'SELECT owner_email FROM houses WHERE id = ?', [String(id)]);
    if (row && row.owner_email === user.email) await S.deleteHouse(t, String(id));
  }
}

// ---------- bloqueios de datas (proprietário) ----------
async function blocks(t, user, op) {
  if (user.role !== 'owner') return; // o corretor nunca grava bloqueios; o servidor faz isso nas reservas
  const mine = async (id) => { const r = await S.one(t, 'SELECT owner_email FROM houses WHERE id = ?', [id]); return r && r.owner_email === user.email; };
  const up = op.up && typeof op.up === 'object' ? op.up : {};
  for (const hid of Object.keys(up)) { if (await mine(hid)) await S.writeBlocks(t, hid, Array.isArray(up[hid]) ? up[hid] : []); }
  for (const hid of (op.del || [])) { if (await mine(String(hid))) await S.writeBlocks(t, String(hid), []); }
}

// ---------- propostas ----------
async function datesTaken(t, hid, nights, exceptId) {
  const bl = new Set(await S.readBlocks(t, hid));
  if (nights.some((d) => bl.has(d))) return 'Essas datas já estão ocupadas.';
  const acc = await t.all("SELECT id, doc FROM proposals WHERE house_id = ? AND status = 'accepted'", [hid]);
  for (const r of acc) {
    if (r.id === exceptId) continue;
    const d = U.parse(r.doc, {});
    if (U.nightList(d.in, d.out).some((k) => nights.includes(k))) return 'Essas datas já foram reservadas.';
  }
  return '';
}

async function createProposal(t, user, inc, post) {
  if (user.role !== 'broker') throw forbid('Só corretores enviam propostas.');
  const hid = String(inc.hid || '').replace(/^r(?=[A-Za-z])/, '');
  const inv = await S.one(t, "SELECT 1 AS x FROM invites WHERE house_id = ? AND broker_email = ? AND status = 'accepted'", [hid, user.email]);
  const hrow = inv && await S.one(t, 'SELECT * FROM houses WHERE id = ?', [hid]);
  if (!hrow) throw forbid('Você não tem acesso a esta casa.');
  const house = S.houseDoc(hrow);
  const a = inc.in; const b = inc.out;
  if (!U.isDate(a) || !U.isDate(b)) throw U.bad('Datas inválidas.');
  const nights = U.nightList(a, b);
  if (!nights.length || nights.length > 60) throw U.bad('A estadia precisa ter de 1 a 60 noites.');
  if (a < U.today()) throw U.bad('A entrada não pode ser no passado.');
  if (nights.length < Math.max(1, house.minN || 1)) throw U.bad('A estadia precisa ter no mínimo ' + house.minN + ' noites.');
  const value = U.num(inc.value, 0);
  if (!(value > 0 && value < 1e9)) throw U.bad('Informe o valor oferecido.');
  const guest = U.clean(inc.guest, 120);
  if (!guest) throw U.bad('Informe o nome do hóspede.');
  const pax = U.int(inc.pax, 1, 1, 500);
  if (pax > house.lot) throw U.bad('O número de hóspedes passa da lotação.');
  const taken = await datesTaken(t, hid, nights, '');
  if (taken) throw conflict(taken);
  const others = await t.all("SELECT broker_email, doc FROM proposals WHERE house_id = ? AND status IN ('pending','countered')", [hid]);
  for (const r of others) {
    const d = U.parse(r.doc, {});
    if (U.nightList(d.in, d.out).some((k) => nights.includes(k))) throw conflict(r.broker_email === user.email ? 'Você já tem uma proposta para essa data.' : 'Essas datas estão reservadas por outra proposta.');
  }
  const recent = await S.one(t, 'SELECT COUNT(*) AS n FROM proposals WHERE broker_email = ? AND updated > ?', [user.email, Date.now() - 864e5]);
  if (Number(recent.n) >= 40) throw U.bad('Limite diário de propostas atingido.', 429);
  let id = /^p\d{6,}$/.test(String(inc.id)) ? String(inc.id) : 'p' + Date.now();
  if (await S.one(t, 'SELECT 1 AS x FROM proposals WHERE id = ?', [id])) id = 'p' + Date.now() + U.rid(2);
  const owner = await S.one(t, 'SELECT name FROM users WHERE email = ?', [hrow.owner_email]);
  const doc = {
    id, hid, house: house.name, broker: user.email, bname: user.name, in: a, out: b, value, guest, pax,
    msg: U.text(inc.msg, 600), status: 'pending', at: U.today(), on: owner ? owner.name : '', adv: house.adv == null ? 50 : house.adv,
    exp: Date.now() + H48, oe: hrow.owner_email, log: [], chat: [],
  };
  await S.saveProposal(t, doc, hid, user.email, hrow.owner_email);
  await S.event(t, hrow.owner_email, 'proposal_new', { house: house.name, broker: user.name, in: a, out: b, value, pid: id });
}

const LOGS = new Set(['pending', 'accepted', 'rejected', 'countered', 'declined', 'cancelled', 'expired', 'paid', 'unpaid']);

async function updateProposal(t, user, row, inc, post) {
  const doc = U.parse(row.doc, {});
  const isOwner = user.role === 'owner' && row.owner_email === user.email;
  const isBroker = user.role === 'broker' && row.broker_email === user.email;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isBroker && !isAdmin) return;
  const next = Object.assign({}, doc);
  const s0 = doc.status; const s1 = typeof inc.status === 'string' ? inc.status : s0;
  const open = S.isOpen(s0);
  const due = doc.exp && doc.exp < Date.now();
  const stale = () => conflict('Esta proposta mudou. Atualizamos a tela para você.');
  if (s1 !== s0) {
    if (isAdmin) {
      if (!(open && s1 === 'cancelled')) throw forbid();
      next.status = 'cancelled';
    } else if (s1 === 'expired') {
      if (!(open && due)) throw stale();
      next.status = 'expired';
    } else if (isOwner) {
      if (s0 === 'pending' && s1 === 'accepted') {
        const taken = await datesTaken(t, row.house_id, U.nightList(doc.in, doc.out), doc.id);
        if (taken) throw conflict(taken);
        next.status = 'accepted'; next.final = doc.value; post.accepted.push(next);
      } else if (s0 === 'pending' && s1 === 'rejected') next.status = 'rejected';
      else if (s0 === 'pending' && s1 === 'countered') {
        const c = U.num(inc.counter, 0);
        if (!(c > 0 && c < 1e9)) throw U.bad('Informe o valor da nova proposta.');
        next.status = 'countered'; next.counter = c; next.exp = Date.now() + H48;
      } else throw stale();
    } else if (isBroker) {
      if (s0 === 'pending' && s1 === 'cancelled') next.status = 'cancelled';
      else if (s0 === 'countered' && s1 === 'accepted') {
        const taken = await datesTaken(t, row.house_id, U.nightList(doc.in, doc.out), doc.id);
        if (taken) throw conflict(taken);
        next.status = 'accepted'; next.final = doc.counter; post.accepted.push(next);
      } else if (s0 === 'countered' && s1 === 'declined') next.status = 'declined';
      else throw stale();
    }
  }
  if (typeof inc.paid === 'boolean' && inc.paid !== !!doc.paid) {
    if (!(isOwner && next.status === 'accepted')) throw forbid();
    next.paid = inc.paid;
  }
  // histórico e conversa só crescem: aceita entradas novas, com a data carimbada pelo servidor
  if (Array.isArray(inc.log) && inc.log.length > (doc.log || []).length) {
    next.log = (doc.log || []).concat(inc.log.slice((doc.log || []).length, (doc.log || []).length + 5).map((l) => ({ d: U.today(), s: LOGS.has(l && l.s) ? l.s : 'pending', v: U.num(l && l.v, 0) })));
  }
  if (Array.isArray(inc.chat) && inc.chat.length > (doc.chat || []).length && !isAdmin) {
    next.chat = (doc.chat || []).concat(inc.chat.slice((doc.chat || []).length, (doc.chat || []).length + 5).map((m) => ({ f: isOwner ? 'owner' : 'broker', t: U.text(m && m.t, 2000), at: Date.now() })).filter((m) => m.t.trim()));
  }
  if (JSON.stringify(next) !== JSON.stringify(doc)) await S.saveProposal(t, next, row.house_id, row.broker_email, row.owner_email);
  if (next.status !== s0) await announce(t, user, row, next, { isOwner, isBroker });
}

// Avisos por e-mail e push das mudanças de estado. Aviso ao corretor nunca cita outro corretor; só o do proprietário traz o nome de quem propôs.
async function announce(t, user, row, next, who) {
  const base = { house: next.house, in: next.in, out: next.out, pid: next.id };
  const to = (email, kind, extra) => S.event(t, email, kind, Object.assign({}, base, extra));
  if (next.status === 'expired') {
    await to(row.broker_email, 'proposal_expired');
    await to(row.owner_email, 'proposal_expired');
  } else if (who.isOwner) {
    if (next.status === 'accepted') await to(row.broker_email, 'proposal_accepted', { value: next.final });
    else if (next.status === 'rejected') await to(row.broker_email, 'proposal_declined');
    else if (next.status === 'countered') await to(row.broker_email, 'proposal_countered', { value: next.counter });
  } else if (who.isBroker) {
    const x = { broker: user.name };
    if (next.status === 'accepted') await to(row.owner_email, 'counter_accepted', Object.assign({ value: next.final }, x));
    else if (next.status === 'declined') await to(row.owner_email, 'counter_declined', x);
    else if (next.status === 'cancelled') await to(row.owner_email, 'proposal_cancelled', x);
  }
}

async function props(t, user, op, post) {
  for (const inc of (op.up || [])) {
    if (!inc || typeof inc.id !== 'string' || inc.ghost || /^g[a-f0-9]{10}$/.test(inc.id)) continue;
    const row = await S.one(t, 'SELECT * FROM proposals WHERE id = ?', [inc.id]);
    if (row) await updateProposal(t, user, row, inc, post);
    else await createProposal(t, user, inc, post);
  }
}

// Depois de aceitar: bloqueia as noites e encerra propostas em aberto que disputavam as mesmas datas.
async function afterAccept(t, post) {
  for (const x of post.accepted) {
    const nights = U.nightList(x.in, x.out);
    await S.writeBlocks(t, x.hid, (await S.readBlocks(t, x.hid)).concat(nights));
    const rest = await t.all("SELECT * FROM proposals WHERE house_id = ? AND status IN ('pending','countered') AND id <> ?", [x.hid, x.id]);
    for (const r of rest) {
      const d = U.parse(r.doc, {});
      if (!U.nightList(d.in, d.out).some((k) => nights.includes(k))) continue;
      d.status = 'rejected';
      (d.log = d.log || []).push({ d: U.today(), s: 'rejected', v: d.value });
      await S.saveProposal(t, d, r.house_id, r.broker_email, r.owner_email);
      await S.notify(t, r.broker_email, 'Sua proposta para ' + d.house + ' foi encerrada: as datas foram reservadas por outra proposta', d.id);
      await S.event(t, r.broker_email, 'proposal_closed', { house: d.house, in: d.in, out: d.out, pid: d.id });
    }
  }
}

// ---------- avisos ----------
async function noti(t, user, op) {
  for (const inc of (op.up || [])) {
    if (!inc || typeof inc !== 'object') continue;
    const to = String(inc.to || ''); const at = U.int(inc.at, Date.now(), 0, 4e12);
    const ex = (await t.all('SELECT id, doc, to_email FROM notifications WHERE to_email = ? AND at = ?', [to, at]))[0];
    if (ex) {
      if (ex.to_email === user.email && inc.read === true) { const d = U.parse(ex.doc, {}); d.read = true; await t.run('UPDATE notifications SET doc = ? WHERE id = ?', [JSON.stringify(d), ex.id]); }
      continue;
    }
    if (!(to === user.email || user.role === 'admin' || await S.related(t, user.email, to))) continue;
    const toUser = await S.one(t, 'SELECT email FROM users WHERE email = ?', [to]);
    if (!toUser) continue;
    await S.notify(t, to, inc.text, typeof inc.pid === 'string' ? inc.pid.slice(0, 80) : undefined, at);
  }
}

// ---------- conversas ----------
const tid = (o, b) => U.sha1(o + '|' + b);
async function chat(t, user, op) {
  for (const inc of (op.up || [])) {
    if (!inc || typeof inc.o !== 'string' || typeof inc.b !== 'string') continue;
    const o = inc.o; const b = inc.b;
    const me = user.role === 'owner' ? o : user.role === 'broker' ? b : null;
    if (!me || me !== user.email) continue;
    if (!(await S.related(t, o, b))) continue;
    const ou = await S.one(t, "SELECT name FROM users WHERE email = ? AND role = 'owner'", [o]);
    const bu = await S.one(t, "SELECT name FROM users WHERE email = ? AND role = 'broker'", [b]);
    if (!ou || !bu) continue;
    const row = await S.one(t, 'SELECT * FROM threads WHERE o_email = ? AND b_email = ?', [o, b]);
    const doc = row ? U.parse(row.doc, {}) : { m: [], s: { o: 0, b: 0 } };
    const role = user.role === 'owner' ? 'o' : 'b';
    const mm = Array.isArray(inc.m) ? inc.m : [];
    if (mm.length > doc.m.length) {
      doc.m = doc.m.concat(mm.slice(doc.m.length, doc.m.length + 10).map((m) => ({ f: role, t: U.text(m && m.t, 2000), at: Date.now() })).filter((m) => m.t.trim()));
    }
    doc.s = doc.s || { o: 0, b: 0 };
    if (inc.s && typeof inc.s[role] === 'number') doc.s[role] = Math.min(Date.now() + 6e4, Math.max(doc.s[role] || 0, inc.s[role]));
    doc.on = ou.name; doc.bn = bu.name;
    const j = JSON.stringify(doc);
    if (row) await t.run('UPDATE threads SET doc = ?, updated = ? WHERE id = ?', [j, Date.now(), row.id]);
    else await t.run('INSERT INTO threads (id, o_email, b_email, doc, updated) VALUES (?,?,?,?,?)', [tid(o, b), o, b, j, Date.now()]);
  }
}

// ---------- perfil, convites removidos, estado pessoal ----------
async function prof(t, user, op) {
  const wa = op.up && op.up[user.email];
  if (wa === undefined || user.role === 'admin') return;
  const d = U.digits(wa);
  if (d.length < 10 || d.length > 13) throw U.bad('Informe um WhatsApp válido, com DDD.');
  await t.run('UPDATE users SET wa = ? WHERE email = ?', [d, user.email]);
}

async function inv(t, user, op) {
  if (user.role !== 'owner') return;
  const set = op.set && typeof op.set === 'object' ? op.set : {};
  for (const hid of Object.keys(set)) {
    const h = await S.one(t, 'SELECT owner_email FROM houses WHERE id = ?', [hid]);
    if (!h || h.owner_email !== user.email) continue;
    const keep = new Set((Array.isArray(set[hid]) ? set[hid] : []).map((x) => String(x && x.email || '').toLowerCase()));
    for (const r of await t.all('SELECT broker_email FROM invites WHERE house_id = ?', [hid])) {
      if (!keep.has(r.broker_email)) await t.run('DELETE FROM invites WHERE house_id = ? AND broker_email = ?', [hid, r.broker_email]);
    }
  }
}

async function ustate(t, user, name, op) {
  if (user.role === 'admin' || !op.set || typeof op.set !== 'object') return;
  const json = JSON.stringify(op.set);
  if (json.length > 40000) throw U.bad('Dados demais.', 413);
  const row = await S.one(t, 'SELECT doc FROM ustate WHERE email = ?', [user.email]);
  const d = row ? U.parse(row.doc, {}) : {};
  d[name] = op.set;
  const j = JSON.stringify(d);
  if (row) await t.run('UPDATE ustate SET doc = ? WHERE email = ?', [j, user.email]);
  else await t.run('INSERT INTO ustate (email, doc) VALUES (?,?)', [user.email, j]);
}

// ---------- ponto de entrada ----------
async function apply(t, user, ops) {
  const post = { accepted: [] };
  const by = {};
  for (const o of (Array.isArray(ops) ? ops : [])) { if (o && typeof o.c === 'string') (by[o.c] = by[o.c] || []).push(o); }
  const run = async (c, fn) => { for (const o of (by[c] || [])) await fn(o); };
  await run('houses', (o) => houses(t, user, o));
  await run('props', (o) => props(t, user, o, post));
  await run('blocks', (o) => blocks(t, user, o));
  await afterAccept(t, post);
  await run('noti', (o) => noti(t, user, o));
  await run('chat', (o) => chat(t, user, o));
  await run('prof', (o) => prof(t, user, o));
  await run('inv', (o) => inv(t, user, o));
  for (const n of ['tour', 'remx', 'rems']) await run(n, (o) => ustate(t, user, n, o));
}

module.exports = { apply, tid };
