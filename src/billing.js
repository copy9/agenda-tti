'use strict';
// Mensalidade da plataforma: único pagamento que acontece dentro do software (AGENTS.md §1).
// Cada conta (proprietário e corretor) tem um período grátis e depois uma assinatura mensal recorrente no Mercado Pago.
// Valor, dias grátis e quem paga ficam no banco (tabela settings) e o administrador muda pelo painel.
const crypto = require('node:crypto');
const cfg = require('./config');
const db = require('./db');
const U = require('./util');
const T = require('./telemetry');

const DAY = 864e5;
const GRACE = 3 * DAY; // folga depois da data prevista da próxima cobrança, para o aviso do Mercado Pago chegar
const KEY = 'billing';
const DEFAULTS = { on: 1, price: 10, trial: 7, roles: 'both' };
const ROLES = ['both', 'owner', 'broker'];

let http = (...a) => fetch(...a);
const setHttp = (f) => { http = f || ((...a) => fetch(...a)); };

// ---------- configuração (muda pelo painel) ----------
let cache = null; let cacheAt = 0;
async function settings() {
  if (cache && Date.now() - cacheAt < 5000) return cache;
  const r = await db.one('SELECT v FROM settings WHERE k = ?', [KEY]);
  let s = U.parse(r && r.v, null);
  if (!s || !s.since) {
    // `since`: a cobrança só vale para quem entrou depois dela existir; contas antigas ganham o período a partir daqui.
    s = Object.assign({}, DEFAULTS, s || {}, { since: Date.now() });
    await save(s);
  }
  cache = Object.assign({}, DEFAULTS, s); cacheAt = Date.now();
  return cache;
}
const save = (s) => db.write(async (t) => {
  const had = (await t.all('SELECT v FROM settings WHERE k = ?', [KEY]))[0];
  if (had) await t.run('UPDATE settings SET v = ? WHERE k = ?', [JSON.stringify(s), KEY]);
  else await t.run('INSERT INTO settings (k, v) VALUES (?, ?)', [KEY, JSON.stringify(s)]);
});
const dropCache = () => { cache = null; };

async function setSettings(inc) {
  const cur = await settings();
  const n = Object.assign({}, cur);
  if ('on' in inc) n.on = inc.on ? 1 : 0;
  if ('price' in inc) {
    const p = Math.round(Number(String(inc.price).replace(',', '.')) * 100) / 100;
    if (!(p >= 1 && p <= 10000)) throw U.bad('Informe um valor mensal entre R$ 1,00 e R$ 10.000,00.');
    n.price = p;
  }
  if ('trial' in inc) {
    const d = Number(inc.trial);
    if (!Number.isInteger(d) || d < 0 || d > 365) throw U.bad('Os dias grátis ficam entre 0 e 365.');
    n.trial = d;
  }
  if ('roles' in inc) {
    if (!ROLES.includes(inc.roles)) throw U.bad('Escolha quem paga: todos, só proprietários ou só corretores.');
    n.roles = inc.roles;
  }
  if (n.on && !cur.on) n.since = Date.now(); // religar a cobrança reinicia o período grátis de todos
  await save(n); dropCache();
  return settings();
}

// ---------- situação de cada conta ----------
// status: free (isenta ou fora da cobrança), trial, active, expired.
function classify(s, role, created, sub, now) {
  const base = { price: s.price, trial: s.trial, configured: !!cfg.MP_ACCESS_TOKEN };
  if (!s.on || !(s.roles === 'both' || s.roles === role)) return Object.assign(base, { status: 'free', applies: false, blocked: false });
  if (sub && sub.free) return Object.assign(base, { status: 'free', applies: true, blocked: false, courtesy: true });
  const paidUntil = Number(sub && sub.paid_until) || 0;
  const renews = !!sub && sub.status === 'authorized';
  if (renews || paidUntil > now) return Object.assign(base, { status: 'active', applies: true, blocked: false, renews, paidUntil });
  const trialEnd = Math.max(Number(created) || 0, s.since) + s.trial * DAY;
  if (now < trialEnd) return Object.assign(base, { status: 'trial', applies: true, blocked: false, trialEnd, daysLeft: Math.max(1, Math.ceil((trialEnd - now) / DAY)) });
  return Object.assign(base, { status: 'expired', applies: true, blocked: base.configured, pending: !!sub && sub.status === 'pending' });
}
async function stateOf(user) {
  const s = await settings();
  if (!s.on || !(s.roles === 'both' || s.roles === user.role)) return classify(s, user.role, 0, null, Date.now());
  const u = await db.one('SELECT created FROM users WHERE email = ?', [user.email]);
  const sub = await db.one('SELECT * FROM subs WHERE email = ?', [user.email]);
  return classify(s, user.role, u && u.created, sub, Date.now());
}

// ---------- Mercado Pago ----------
async function mp(method, path, body) {
  let r;
  try {
    r = await http(cfg.MP_API_BASE + path, {
      method,
      headers: { Authorization: 'Bearer ' + cfg.MP_ACCESS_TOKEN, 'Content-Type': 'application/json', ...(method === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    T.inc('tti_mp_total', { result: 'unreachable' }, 1, 'Chamadas ao Mercado Pago');
    T.log('error', 'mercado pago fora do ar', { path, error: e.message });
    throw U.bad('Não foi possível falar com o Mercado Pago agora. Tente de novo em instantes.', 502);
  }
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* sem corpo */ }
  if (!r.ok) {
    T.inc('tti_mp_total', { result: 'error' });
    T.log('error', 'mercado pago recusou a chamada', { path, status: r.status, detail: j && (j.message || j.error) });
    throw U.bad('O Mercado Pago não aceitou a operação. Tente de novo em instantes.', 502);
  }
  T.inc('tti_mp_total', { result: 'ok' });
  return j || {};
}
const needMp = () => { if (!cfg.MP_ACCESS_TOKEN) throw U.bad('O pagamento ainda não foi configurado. Fale com a administração.', 503); };

const rowOf = (t, email) => t.all('SELECT * FROM subs WHERE email = ?', [email]).then((r) => r[0]);
async function ensureRow(t, email) {
  let r = await rowOf(t, email);
  if (!r) {
    await t.run('INSERT INTO subs (email, ref, mp_id, status, paid_until, free, updated) VALUES (?, ?, ?, ?, ?, ?, ?)', [email, U.rid(8), '', 'none', 0, 0, Date.now()]);
    r = await rowOf(t, email);
  }
  return r;
}

async function subscribe(user) {
  needMp();
  if (!/^https:\/\//.test(cfg.PUBLIC_URL)) throw U.bad('O endereço público do site (PUBLIC_URL, com https) ainda não foi configurado.', 503);
  const st = await stateOf(user);
  if (!st.applies) throw U.bad('Sua conta não precisa de assinatura.', 409);
  if (st.status === 'active' && st.renews) throw U.bad('Sua assinatura já está ativa.', 409);
  const s = await settings();
  const sub = await db.write((t) => ensureRow(t, user.email));
  const pa = await mp('POST', '/preapproval', {
    reason: 'Agenda TTI · mensalidade',
    external_reference: sub.ref,
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: s.price, currency_id: 'BRL' },
    back_url: cfg.PUBLIC_URL + '/?assinatura=retorno',
    status: 'pending',
  });
  if (!pa.id || !pa.init_point) throw U.bad('O Mercado Pago não devolveu o link de pagamento. Tente de novo.', 502);
  await db.write((t) => t.run("UPDATE subs SET mp_id = ?, status = 'pending', updated = ? WHERE email = ?", [String(pa.id), Date.now(), user.email]));
  T.inc('tti_billing_total', { event: 'checkout' }, 1, 'Eventos de cobrança');
  return { url: pa.init_point };
}

// Aplica o que o Mercado Pago diz sobre uma assinatura. Nunca confiamos no corpo do aviso: o estado vem da consulta à API.
async function applyPreapproval(pa) {
  if (!pa || !pa.id) return false;
  const ref = String(pa.external_reference || '');
  const row = await db.one('SELECT * FROM subs WHERE mp_id = ?', [String(pa.id)]) || (ref && await db.one('SELECT * FROM subs WHERE ref = ?', [ref]));
  if (!row) return false;
  const status = ['authorized', 'pending', 'paused', 'cancelled'].includes(pa.status) ? pa.status : row.status;
  // aviso atrasado de uma assinatura antiga não pode derrubar a nova
  if (row.mp_id && row.mp_id !== String(pa.id) && status !== 'authorized') return false;
  let paid = Number(row.paid_until) || 0;
  if (status === 'authorized') {
    const nx = Date.parse(pa.next_payment_date);
    paid = Math.max(paid, Number.isFinite(nx) ? nx + GRACE : Date.now() + 31 * DAY + GRACE);
  }
  await db.write((t) => t.run('UPDATE subs SET mp_id = ?, status = ?, paid_until = ?, updated = ? WHERE email = ?', [String(pa.id), status, paid, Date.now(), row.email]));
  T.inc('tti_billing_total', { event: status }, 1);
  return true;
}

async function refresh(user) {
  needMp();
  const sub = await db.one('SELECT mp_id FROM subs WHERE email = ?', [user.email]);
  if (sub && sub.mp_id) await applyPreapproval(await mp('GET', '/preapproval/' + encodeURIComponent(sub.mp_id)));
  return stateOf(user);
}

async function cancelRemote(email) {
  const sub = await db.one('SELECT mp_id, status FROM subs WHERE email = ?', [email]);
  if (!sub || !sub.mp_id || sub.status !== 'authorized' || !cfg.MP_ACCESS_TOKEN) return false;
  await mp('PUT', '/preapproval/' + encodeURIComponent(sub.mp_id), { status: 'cancelled' });
  await db.write((t) => t.run("UPDATE subs SET status = 'cancelled', updated = ? WHERE email = ?", [Date.now(), email]));
  return true;
}
async function cancel(user) {
  needMp();
  if (!(await cancelRemote(user.email))) throw U.bad('Não há assinatura ativa para cancelar.', 409);
  T.inc('tti_billing_total', { event: 'user_cancel' });
  return stateOf(user);
}

// Aviso do Mercado Pago. Se MP_WEBHOOK_SECRET existir, a assinatura (x-signature) é conferida.
function verifySignature(req, id) {
  if (!cfg.MP_WEBHOOK_SECRET) return;
  const sig = String(req.headers['x-signature'] || '');
  const ts = (sig.match(/(?:^|,)\s*ts=([^,]+)/) || [])[1];
  const v1 = (sig.match(/(?:^|,)\s*v1=([a-f0-9]+)/) || [])[1];
  if (!ts || !v1) throw U.bad('Assinatura ausente.', 401);
  const mid = /^[A-Za-z0-9]+$/.test(id) ? id.toLowerCase() : id;
  const mac = crypto.createHmac('sha256', cfg.MP_WEBHOOK_SECRET).update(`id:${mid};request-id:${req.headers['x-request-id'] || ''};ts:${ts};`).digest('hex');
  const a = Buffer.from(mac); const b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw U.bad('Assinatura inválida.', 401);
}
async function webhook(req) {
  const q = req.query || {}; const body = req.body && typeof req.body === 'object' ? req.body : {};
  const type = String(q.type || q.topic || body.type || '');
  const id = String(q['data.id'] || (body.data && body.data.id) || q.id || '');
  verifySignature(req, id);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(id)) return { ok: true };
  if (!cfg.MP_ACCESS_TOKEN) return { ok: true };
  if (type === 'subscription_preapproval' || type === 'preapproval') await applyPreapproval(await mp('GET', '/preapproval/' + encodeURIComponent(id)));
  else if (type === 'subscription_authorized_payment' || type === 'authorized_payment') {
    const ap = await mp('GET', '/authorized_payments/' + encodeURIComponent(id));
    if (ap.preapproval_id) await applyPreapproval(await mp('GET', '/preapproval/' + encodeURIComponent(ap.preapproval_id)));
  }
  return { ok: true };
}

// ---------- painel do administrador ----------
async function adminView() {
  const s = await settings(); const now = Date.now();
  const rows = await db.all("SELECT u.email, u.name, u.role, u.created, b.status AS bs, b.paid_until, b.free FROM users u LEFT JOIN subs b ON b.email = u.email WHERE u.role IN ('owner', 'broker') ORDER BY u.created DESC");
  const counts = { trial: 0, active: 0, expired: 0, free: 0 };
  const list = rows.map((r) => {
    const st = classify(s, r.role, r.created, r.bs === undefined || r.bs === null ? null : { status: r.bs, paid_until: r.paid_until, free: r.free }, now);
    counts[st.status] += 1;
    return { email: r.email, name: r.name, role: r.role, status: st.status, daysLeft: st.daysLeft || 0, paidUntil: st.paidUntil || 0, courtesy: !!st.courtesy, renews: !!st.renews };
  });
  return { settings: { on: !!s.on, price: s.price, trial: s.trial, roles: s.roles }, configured: !!cfg.MP_ACCESS_TOKEN, signed: !!cfg.MP_WEBHOOK_SECRET, hook: (cfg.PUBLIC_URL || '') + '/api/billing/webhook', counts, list: list.slice(0, 300) };
}
async function setFree(email, on) {
  email = String(email || '').toLowerCase();
  if (!(await db.one("SELECT 1 AS x FROM users WHERE email = ? AND role IN ('owner', 'broker')", [email]))) throw U.bad('Conta não encontrada.', 404);
  await db.write(async (t) => { await ensureRow(t, email); await t.run('UPDATE subs SET free = ?, updated = ? WHERE email = ?', [on ? 1 : 0, Date.now(), email]); });
}

const publicState = (st) => ({ status: st.status, applies: st.applies, blocked: st.blocked, daysLeft: st.daysLeft || 0, trialEnd: st.trialEnd || 0, paidUntil: st.paidUntil || 0, renews: !!st.renews, courtesy: !!st.courtesy, pending: !!st.pending, price: st.price, trial: st.trial, configured: st.configured });

module.exports = { settings, setSettings, stateOf, subscribe, refresh, cancel, cancelRemote, webhook, adminView, setFree, publicState, setHttp };
