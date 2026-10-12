'use strict';
// Monta, para cada pessoa, só o que ela pode ver. A privacidade entre corretores é garantida aqui.
const db = require('./db');
const U = require('./util');
const S = require('./store');

const ids = (a) => a.map((x) => x.id);
const inList = (a) => a.map(() => '?').join(',');

async function usersByRole(role) {
  return db.all('SELECT email, name, wa FROM users WHERE role = ? ORDER BY name', [role]);
}
async function docsOf(rows) { return rows.map((r) => { const d = U.parse(r.doc, {}); d.status = r.status || d.status; return d; }); }

async function notiOf(email) {
  const rows = await db.all('SELECT doc FROM notifications WHERE to_email = ? ORDER BY at DESC', [email]);
  return rows.slice(0, 200).map((r) => U.parse(r.doc, null)).filter(Boolean);
}
async function ustateOf(email) {
  const r = await db.one('SELECT doc FROM ustate WHERE email = ?', [email]);
  const d = r ? U.parse(r.doc, {}) : {};
  return { tour: d.tour || {}, remx: d.remx || {}, rems: d.rems || {} };
}
const threadDocs = (rows) => rows.map((r) => { const d = U.parse(r.doc, {}); d.id = r.o_email + '|' + r.b_email; d.o = r.o_email; d.b = r.b_email; return d; });

function brokerHouse(doc, owner, blocked) {
  const d = Object.assign({}, doc);
  delete d.custom;
  return Object.assign(d, { id: 'r' + doc.id, ro: true, owner: owner ? owner.name : '', oe: doc.owner, blocked: blocked || [] });
}

async function owned(user) {
  const rows = await db.all('SELECT * FROM houses WHERE owner_email = ? ORDER BY updated', [user.email]);
  const houses = rows.map(S.houseDoc);
  const hid = ids(houses);
  const blocks = {};
  if (hid.length) (await db.all(`SELECT house_id, dates FROM blocks WHERE house_id IN (${inList(hid)})`, hid)).forEach((r) => { blocks[r.house_id] = U.parse(r.dates, []); });
  return { houses, blocks };
}

async function ownerView(user) {
  const { houses, blocks } = await owned(user);
  const props = await docsOf(await db.all('SELECT status, doc FROM proposals WHERE owner_email = ?', [user.email]));
  const inv = {};
  (await db.all('SELECT house_id, broker_email, created, token, status FROM invites WHERE owner_email = ? ORDER BY created', [user.email])).forEach((r) => {
    (inv[r.house_id] = inv[r.house_id] || []).push({ email: r.broker_email, at: U.isoOf(new Date(r.created)), tok: r.token, ok: r.status === 'accepted' });
  });
  // O proprietário só enxerga corretores ligados a ele: convidados, com proposta ou com conversa.
  const mine = new Set();
  Object.values(inv).forEach((l) => l.forEach((i) => mine.add(i.email)));
  props.forEach((p) => { if (p.broker) mine.add(p.broker); });
  const chat = threadDocs(await db.all('SELECT * FROM threads WHERE o_email = ?', [user.email]));
  chat.forEach((c) => mine.add(c.b));
  const brokers = {};
  (await usersByRole('broker')).filter((b) => mine.has(b.email)).forEach((b) => { brokers[b.email] = { name: b.name, wa: b.wa, houses: [] }; });
  return {
    owners: { [user.email]: { name: user.name, wa: user.wa } }, brokers, houses, blocks, props, inv, chat,
    noti: await notiOf(user.email), prof: user.wa ? { [user.email]: user.wa } : {},
  };
}

async function brokerView(user) {
  const invs = await db.all("SELECT house_id FROM invites WHERE broker_email = ? AND status = 'accepted'", [user.email]);
  const hid = invs.map((r) => r.house_id);
  let houses = []; const blocks = {};
  const own = {};
  (await usersByRole('owner')).forEach((o) => { own[o.email] = o; });
  if (hid.length) {
    houses = (await db.all(`SELECT * FROM houses WHERE id IN (${inList(hid)})`, hid)).map(S.houseDoc);
    (await db.all(`SELECT house_id, dates FROM blocks WHERE house_id IN (${inList(hid)})`, hid)).forEach((r) => { blocks[r.house_id] = U.parse(r.dates, []); });
  }
  const today = U.today();
  const bh = houses.map((h) => brokerHouse(h, own[h.owner], (blocks[h.id] || []).filter((d) => d >= today)));
  const mine = await docsOf(await db.all('SELECT status, doc FROM proposals WHERE broker_email = ?', [user.email]));
  // Propostas de outros corretores viram apenas "datas seguradas": sem nome, valor ou qualquer dado pessoal.
  let ghosts = [];
  if (hid.length) {
    const rows = await db.all(`SELECT id, house_id, doc FROM proposals WHERE broker_email <> ? AND status IN ('pending','countered') AND house_id IN (${inList(hid)})`, [user.email, ...hid]);
    ghosts = rows.map((r) => { const d = U.parse(r.doc, {}); return { id: 'g' + U.sha1(r.id).slice(0, 10), hid: r.house_id, broker: '', status: 'pending', in: d.in, out: d.out, exp: d.exp, ghost: 1 }; });
  }
  const chat = threadDocs(await db.all('SELECT * FROM threads WHERE b_email = ?', [user.email]));
  const owners = {};
  Object.values(own).forEach((o) => { owners[o.email] = { name: o.name, wa: o.wa }; });
  return {
    owners, brokers: { [user.email]: { name: user.name, wa: user.wa, houses: bh } }, houses: [], blocks, props: mine.concat(ghosts), inv: {}, chat,
    noti: await notiOf(user.email), prof: user.wa ? { [user.email]: user.wa } : {},
  };
}

async function adminView() {
  const users = await db.all('SELECT email, role, name, wa, suspended FROM users');
  const owners = {}; const brokers = {}; const susp = {}; const prof = {};
  const hs = (await db.all('SELECT * FROM houses')).map(S.houseDoc);
  const accepted = await db.all("SELECT broker_email, house_id FROM invites WHERE status = 'accepted'");
  users.forEach((u) => {
    if (u.suspended) susp[u.email] = 1;
    if (u.wa) prof[u.email] = u.wa;
    if (u.role === 'owner') owners[u.email] = { name: u.name, wa: u.wa };
    else brokers[u.email] = { name: u.name, wa: u.wa, houses: accepted.filter((a) => a.broker_email === u.email).map((a) => ({ id: 'r' + a.house_id })) };
  });
  const blocks = {};
  (await db.all('SELECT house_id, dates FROM blocks')).forEach((r) => { blocks[r.house_id] = U.parse(r.dates, []); });
  const props = await docsOf(await db.all('SELECT status, doc FROM proposals'));
  const noti = (await db.all('SELECT doc FROM notifications ORDER BY at DESC')).slice(0, 80).map((r) => U.parse(r.doc, null)).filter(Boolean);
  // Mensagens das conversas são privadas: a administração só vê que a conversa existe.
  const chat = (await db.all('SELECT o_email, b_email FROM threads')).map((r) => ({ id: r.o_email + '|' + r.b_email, o: r.o_email, b: r.b_email, m: [], s: { o: 0, b: 0 } }));
  return { owners, brokers, houses: hs, blocks, props, inv: {}, chat, noti, prof, susp };
}

async function viewFor(user) {
  let v;
  if (user.role === 'admin') v = await adminView();
  else if (user.role === 'owner') v = await ownerView(user);
  else v = await brokerView(user);
  const st = user.role === 'admin' ? { tour: {}, remx: {}, rems: {} } : await ustateOf(user.email);
  return Object.assign({ edits: {}, susp: {} }, v, st);
}

module.exports = { viewFor };
