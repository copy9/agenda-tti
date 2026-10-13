'use strict';
// Ações da administração. Cada função roda dentro de uma transação.
const db = require('./db');
const U = require('./util');
const S = require('./store');

async function setSuspended(email, on) {
  email = String(email || '').toLowerCase();
  const n = await db.write(async (t) => {
    const r = await t.run('UPDATE users SET suspended = ? WHERE email = ?', [on ? 1 : 0, email]);
    if (on) await t.run('DELETE FROM sessions WHERE email = ?', [email]);
    return r.changes;
  });
  if (!n) throw U.bad('Conta não encontrada.', 404);
}

async function deleteUser(email) {
  email = String(email || '').toLowerCase();
  await db.write(async (t) => {
    const u = await S.one(t, 'SELECT role FROM users WHERE email = ?', [email]);
    if (!u) throw U.bad('Conta não encontrada.', 404);
    if (u.role === 'owner') {
      for (const h of await t.all('SELECT id FROM houses WHERE owner_email = ?', [email])) await S.deleteHouse(t, h.id);
    }
    await t.run('DELETE FROM invites WHERE broker_email = ? OR owner_email = ?', [email, email]);
    await t.run('DELETE FROM proposals WHERE broker_email = ? OR owner_email = ?', [email, email]);
    await t.run('DELETE FROM threads WHERE o_email = ? OR b_email = ?', [email, email]);
    await t.run('DELETE FROM notifications WHERE to_email = ?', [email]);
    await t.run('DELETE FROM sessions WHERE email = ?', [email]);
    await t.run('DELETE FROM ustate WHERE email = ?', [email]);
    await t.run('DELETE FROM users WHERE email = ?', [email]);
  });
}

async function deleteHouse(id) {
  await db.write(async (t) => {
    if (!(await S.one(t, 'SELECT id FROM houses WHERE id = ?', [String(id)]))) throw U.bad('Casa não encontrada.', 404);
    await S.deleteHouse(t, String(id));
  });
}

async function cancelProposal(id) {
  await db.write(async (t) => {
    const r = await S.one(t, 'SELECT * FROM proposals WHERE id = ?', [String(id)]);
    if (!r) throw U.bad('Proposta não encontrada.', 404);
    const d = U.parse(r.doc, {});
    if (!S.isOpen(d.status)) throw U.bad('Só propostas em aberto podem ser canceladas.', 409);
    d.status = 'cancelled';
    d.log = d.log || [];
    d.log.push({ d: U.today(), s: 'cancelled', v: d.value });
    await S.saveProposal(t, d, r.house_id, r.broker_email, r.owner_email);
    await S.notify(t, r.broker_email, 'A administração cancelou a proposta para ' + d.house, d.id);
    await S.notify(t, r.owner_email, 'A administração cancelou a proposta de ' + d.bname + ' para ' + d.house, d.id);
  });
}

// Cópia de segurança em JSON (sem senhas, sem sessões e sem o conteúdo binário das fotos).
async function backup() {
  const out = { app: 'agenda-tti', at: new Date().toISOString(), version: 1 };
  out.users = (await db.all('SELECT email, role, name, wa, code, suspended, created FROM users'));
  out.houses = (await db.all('SELECT id, owner_email, slug, doc, updated FROM houses')).map((r) => ({ ...r, doc: U.parse(r.doc, {}) }));
  out.blocks = (await db.all('SELECT house_id, dates FROM blocks')).map((r) => ({ house_id: r.house_id, dates: U.parse(r.dates, []) }));
  out.invites = await db.all('SELECT house_id, owner_email, broker_email, status, created, accepted FROM invites');
  out.proposals = (await db.all('SELECT id, house_id, broker_email, owner_email, status, doc FROM proposals')).map((r) => ({ ...r, doc: U.parse(r.doc, {}) }));
  out.photos = (await db.all('SELECT id, house_id, mime, created FROM photos'));
  return out;
}

module.exports = { setSuspended, deleteUser, deleteHouse, cancelProposal, backup };
