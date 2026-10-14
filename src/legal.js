'use strict';
// Termos de uso, política de privacidade e direitos do titular (LGPD): páginas, aceite, exportar e apagar os próprios dados.
const cfg = require('./config');
const db = require('./db');
const U = require('./util');
const S = require('./store');
const ADM = require('./admin');
const V = require('./views');
const { UI, TEXTS } = require('./legal-texts');

const LANGS = ['pt', 'en', 'es'];
const DAY = 864e5;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pickLang = (l) => (LANGS.includes(l) ? l : 'pt');

function fill(s) {
  return esc(s.replace(/\{company\}/g, cfg.COMPANY_NAME).replace(/\{contact\}/g, cfg.LEGAL_CONTACT || '—').replace(/\{grace\}/g, String(cfg.DELETE_GRACE_DAYS)).replace(/\{version\}/g, cfg.LEGAL_VERSION));
}

// Página completa e independente (não carrega o app), com modo escuro e troca de idioma.
function page(kind, lang) {
  lang = pickLang(lang);
  if (kind !== 'terms' && kind !== 'privacy') return null;
  const ui = UI[lang];
  const other = kind === 'terms' ? 'privacy' : 'terms';
  const path = (k, l) => `/${k === 'terms' ? 'termos' : 'privacidade'}?lg=${l}`;
  const body = TEXTS[lang][kind].map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((p) => `<p>${fill(p)}</p>`).join('')}`).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(ui[kind])} · Agenda TTI</title>
<style>:root{--bg:#fff;--fg:#14212b;--mu:#5b6b78;--ln:#dbe3e8;--ac:#0F4C5C;--wn:#fff4d6;--wf:#6b4e00}@media(prefers-color-scheme:dark){:root{--bg:#0e161b;--fg:#e8eef2;--mu:#9fb0bb;--ln:#25343d;--ac:#7cc4d6;--wn:#3a2f10;--wf:#f2d98a}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{max-width:720px;margin:0 auto;padding:28px 20px 72px}
nav{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;margin-bottom:28px;font-size:14px}a{color:var(--ac)}h1{font-size:30px;letter-spacing:-.02em;margin:0 0 4px}h2{font-size:18px;margin:30px 0 4px}.mu{color:var(--mu);font-size:14px;margin:0 0 20px}
.dr{background:var(--wn);color:var(--wf);border-radius:10px;padding:10px 14px;font-size:14px;margin:0 0 22px}nav b{margin-left:auto}nav .on{font-weight:700;text-decoration:none;color:var(--fg)}</style></head><body><main>
<nav><a href="/">${esc(ui.home)}</a><a href="${path('terms', lang)}"${kind === 'terms' ? ' class="on"' : ''}>${esc(ui.terms)}</a><a href="${path('privacy', lang)}"${kind === 'privacy' ? ' class="on"' : ''}>${esc(ui.privacy)}</a><b>${LANGS.map((l) => (l === lang ? l.toUpperCase() : `<a href="${path(kind, l)}">${l.toUpperCase()}</a>`)).join(' · ')}</b></nav>
<h1>${esc(ui[kind])}</h1><p class="mu">${esc(ui.version)} ${esc(cfg.LEGAL_VERSION)}${cfg.LEGAL_CONTACT ? ' · ' + esc(ui.contact) + ': ' + esc(cfg.LEGAL_CONTACT) : ''}</p>
${cfg.LEGAL_REVIEWED ? '' : `<div class="dr" role="note">${esc(ui.draft)}</div>`}${body}
<p class="mu" style="margin-top:36px">${esc(ui[other])}: <a href="${path(other, lang)}">${esc(ui[other])}</a></p></main></body></html>`;
}

const termsState = (user) => ({ version: cfg.LEGAL_VERSION, ok: !user.needTerms });

async function accept(user, ip, version) {
  if (String(version) !== cfg.LEGAL_VERSION) throw U.bad('Esta não é a versão atual dos termos. Recarregue a página.', 409);
  await db.write(async (t) => {
    const ok = await S.one(t, "SELECT 1 AS x FROM consents WHERE email = ? AND kind = 'terms' AND version = ?", [user.email, cfg.LEGAL_VERSION]);
    if (!ok) await S.consent(t, user.email, ip, cfg.LEGAL_VERSION, 'terms');
  });
}

// ---------- direitos do titular ----------
const hashOf = (email) => U.sha256(email);

async function exportData(user) {
  const u = await db.one('SELECT email, role, name, wa, created FROM users WHERE email = ?', [user.email]);
  const consents = (await db.all('SELECT kind, version, at FROM consents WHERE email = ? ORDER BY at', [user.email])).map((r) => ({ kind: r.kind, version: r.version, at: new Date(Number(r.at)).toISOString() }));
  const requests = (await db.all('SELECT kind, status, created, due, done FROM data_requests WHERE email_hash = ? ORDER BY created', [hashOf(user.email)]))
    .map((r) => ({ kind: r.kind, status: r.status, created: new Date(Number(r.created)).toISOString(), due: new Date(Number(r.due)).toISOString(), done: Number(r.done) ? new Date(Number(r.done)).toISOString() : null }));
  const view = await V.viewFor(user);
  return {
    generatedAt: new Date().toISOString(), legalVersion: cfg.LEGAL_VERSION,
    account: { email: u.email, role: u.role, name: u.name, wa: u.wa, createdAt: new Date(Number(u.created)).toISOString() },
    consents, requests, data: view,
  };
}

async function pendingDelete(email) {
  return db.one("SELECT id, created, due FROM data_requests WHERE email_hash = ? AND kind = 'delete' AND status = 'pending'", [hashOf(email)]);
}
async function deleteStatus(user) {
  const p = await pendingDelete(user.email);
  return p ? { pending: true, due: Number(p.due), grace: cfg.DELETE_GRACE_DAYS } : { pending: false, grace: cfg.DELETE_GRACE_DAYS };
}
async function requestDelete(user, pass, checkPass) {
  const row = await db.one('SELECT pass_hash FROM users WHERE email = ?', [user.email]);
  if (!row || !(await checkPass(String(pass || ''), row.pass_hash))) throw U.bad('Senha incorreta.', 403);
  const ex = await pendingDelete(user.email);
  if (ex) return { pending: true, due: Number(ex.due), grace: cfg.DELETE_GRACE_DAYS };
  const now = Date.now(); const due = now + cfg.DELETE_GRACE_DAYS * DAY;
  await db.write((t) => t.run('INSERT INTO data_requests (id, email_hash, email, kind, status, created, due, done) VALUES (?,?,?,?,?,?,?,0)', [U.rid(8), hashOf(user.email), user.email, 'delete', 'pending', now, due]));
  return { pending: true, due, grace: cfg.DELETE_GRACE_DAYS };
}
async function cancelDelete(user) {
  const n = await db.write(async (t) => (await t.run("UPDATE data_requests SET status = 'canceled', email = '', done = ? WHERE email_hash = ? AND kind = 'delete' AND status = 'pending'", [Date.now(), hashOf(user.email)])).changes);
  return { pending: false, canceled: n > 0, grace: cfg.DELETE_GRACE_DAYS };
}
// Chamada pelo relógio do servidor: apaga as contas cuja carência venceu e guarda só o registro mínimo.
async function processDue() {
  const rows = await db.all("SELECT id, email FROM data_requests WHERE kind = 'delete' AND status = 'pending' AND due <= ?", [Date.now()]);
  let n = 0;
  for (const r of rows) {
    try { await ADM.deleteUser(r.email); } catch (e) { if (e.status !== 404) throw e; }
    await db.write((t) => t.run("UPDATE data_requests SET status = 'done', email = '', done = ? WHERE id = ?", [Date.now(), r.id]));
    n++;
  }
  return n;
}

module.exports = { page, termsState, accept, exportData, deleteStatus, requestDelete, cancelDelete, processDue };
