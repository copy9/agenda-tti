'use strict';
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const U = require('./util');
const S = require('./store');

const COOKIE = 'tti_sid';
const RESERVED = new Set(['teste@teste.com', 'tester@teste.com', 'marina@demo.com', 'roberto@demo.com', 'ana@demo.com', 'carlos@demo.com', 'fernanda@demo.com', 'admin@agendatti.com']);

// ---------- senha (scrypt, nativo do Node) ----------
function scrypt(pass, salt) {
  return new Promise((ok, no) => crypto.scrypt(pass, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? no(e) : ok(k))));
}
async function hashPass(pass) {
  const salt = crypto.randomBytes(16);
  const k = await scrypt(String(pass), salt);
  return `s1$${salt.toString('hex')}$${k.toString('hex')}`;
}
async function checkPass(pass, stored) {
  const p = String(stored || '').split('$');
  if (p[0] !== 's1' || p.length !== 3) return false;
  const k = await scrypt(String(pass), Buffer.from(p[1], 'hex'));
  const want = Buffer.from(p[2], 'hex');
  return want.length === k.length && crypto.timingSafeEqual(k, want);
}

// ---------- limite de tentativas ----------
const hits = new Map();
function limit(key, max, windowMs) {
  const t = Date.now();
  const a = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (a.length >= max) { hits.set(key, a); throw U.bad('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429); }
  a.push(t); hits.set(key, a);
}
setInterval(() => { const t = Date.now(); for (const [k, a] of hits) { if (!a.some((x) => t - x < 3600e3)) hits.delete(k); } }, 600e3).unref();
const clearHits = (key) => hits.delete(key);

// ---------- sessões ----------
async function startSession(res, email, role) {
  const token = crypto.randomBytes(32).toString('hex');
  const exp = Date.now() + cfg.SESSION_DAYS * 864e5;
  await db.write(async (t) => {
    await t.run('DELETE FROM sessions WHERE exp < ?', [Date.now()]);
    await t.run('INSERT INTO sessions (id, email, role, exp) VALUES (?,?,?,?)', [U.sha256(token), email, role, exp]);
  });
  res.setCookie(COOKIE, token, { maxAge: cfg.SESSION_DAYS * 86400 });
}
async function endSession(req, res) {
  const tk = req.cookies[COOKIE];
  if (tk) await db.write((t) => t.run('DELETE FROM sessions WHERE id = ?', [U.sha256(tk)]));
  res.setCookie(COOKIE, '', { maxAge: 0 });
}
async function loadSession(req) {
  const tk = req.cookies[COOKIE];
  if (!tk || !/^[a-f0-9]{64}$/.test(tk)) return null;
  const s = await db.one('SELECT email, role, exp FROM sessions WHERE id = ?', [U.sha256(tk)]);
  if (!s || s.exp < Date.now()) return null;
  if (s.role === 'admin') return { role: 'admin', email: s.email, name: 'Administração', wa: '' };
  const u = await db.one('SELECT email, role, name, wa, code, suspended FROM users WHERE email = ?', [s.email]);
  if (!u || u.suspended) return null;
  const ok = await db.one("SELECT 1 AS x FROM consents WHERE email = ? AND kind = 'terms' AND version = ?", [s.email, cfg.LEGAL_VERSION]);
  return { role: u.role, email: u.email, name: u.name, wa: u.wa, code: u.code, needTerms: !ok };
}
const publicUser = (u) => ({ role: u.role, email: u.email, name: u.name, wa: u.wa || '', code: u.code, needTerms: !!u.needTerms });

// ---------- cadastro e login ----------
async function register(req, res) {
  const b = req.body || {};
  const role = b.role === 'broker' ? 'broker' : b.role === 'owner' ? 'owner' : null;
  const email = String(b.email || '').trim().toLowerCase();
  const name = U.clean(b.name, 120);
  const wa = U.digits(b.wa);
  const pass = String(b.pass || '');
  limit('reg:' + req.ip_, 12, 3600e3);
  if (!role) throw U.bad('Escolha o tipo de conta.');
  if (b.terms !== true) throw U.bad('Aceite os Termos de uso e a Política de privacidade para criar a conta.', 400, 'terms');
  if (!U.isEmail(email)) throw U.bad('Informe um e-mail válido.');
  if (!name) throw U.bad('Informe seu nome.');
  if (wa.length < 10 || wa.length > 13) throw U.bad('Informe um WhatsApp válido, com DDD.');
  if (pass.length < 6 || pass.length > 200) throw U.bad('Crie uma senha com pelo menos 6 caracteres.');
  if (RESERVED.has(email) || email === cfg.ADMIN_EMAIL) throw U.bad('Já existe uma conta com este e-mail. Use Entrar.', 409);
  const hash = await hashPass(pass);
  const code = U.rid(4);
  await db.write(async (t) => {
    const ex = (await t.all('SELECT email FROM users WHERE email = ?', [email]))[0];
    if (ex) throw U.bad('Já existe uma conta com este e-mail. Use Entrar.', 409);
    await t.run('INSERT INTO users (email, role, name, wa, pass_hash, code, suspended, created) VALUES (?,?,?,?,?,?,0,?)', [email, role, name, wa, hash, code, Date.now()]);
    await S.consent(t, email, req.ip_, cfg.LEGAL_VERSION, 'terms');
    await S.setPrefs(t, email, { lang: b.lang });
  });
  await startSession(res, email, role);
  return { email, role, name, wa, code, needTerms: false };
}

async function login(req, res) {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const role = b.role === 'broker' ? 'broker' : 'owner';
  const pass = String(b.pass || '');
  limit('login:' + req.ip_, 40, 900e3);
  limit('loginu:' + email, 10, 900e3);
  const u = await db.one('SELECT * FROM users WHERE email = ?', [email]);
  // Mesmo sem usuário, faz uma verificação para não revelar se o e-mail existe pelo tempo de resposta.
  const ok = await checkPass(pass, u ? u.pass_hash : 's1$00$00');
  if (!u || !ok) throw U.bad('E-mail ou senha incorretos. Confira os dados e tente de novo.', 401);
  if (u.suspended) throw U.bad('Esta conta está suspensa. Fale com a administração.', 403);
  if (u.role !== role) throw U.bad(u.role === 'broker' ? 'Este e-mail é de corretor. Use a aba "Sou corretor".' : 'Este e-mail é de proprietário. Use a aba "Sou proprietário".', 409);
  clearHits('loginu:' + email);
  await startSession(res, u.email, u.role);
  return publicUser(u);
}

// ---------- recuperação de senha ----------
const RESET_MIN = 30;
// Resposta sempre igual, exista o e-mail ou não. O link vale 30 min e só uma vez; no banco fica só o hash.
async function forgot(req) {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  limit('fgi:' + req.ip_, 20, 3600e3);
  if (!U.isEmail(email)) throw U.bad('Informe um e-mail válido.');
  let mail = true;
  try { limit('fge:' + email, 3, 3600e3); } catch (e) { mail = false; }
  const u = mail && await db.one('SELECT email, suspended FROM users WHERE email = ?', [email]);
  if (u && !u.suspended) {
    const token = crypto.randomBytes(32).toString('hex');
    const base = cfg.PUBLIC_URL || (req.secure_ ? 'https://' : 'http://') + (req.headers.host || 'localhost');
    await db.write(async (t) => {
      await t.run('DELETE FROM pwreset WHERE email = ? OR exp < ?', [email, Date.now()]);
      await t.run('INSERT INTO pwreset (id, email, exp, used) VALUES (?,?,?,0)', [U.sha256(token), email, Date.now() + RESET_MIN * 60e3]);
      await S.event(t, email, 'password_reset', { url: base + '/?redefinir=' + token }, { force: true });
    });
  }
  return { ok: true };
}
async function reset(req, res) {
  const b = req.body || {};
  const token = String(b.token || ''); const pass = String(b.pass || '');
  limit('rsi:' + req.ip_, 30, 3600e3);
  if (!/^[a-f0-9]{64}$/.test(token)) throw U.bad('Este link não é válido ou já foi usado. Peça um novo.', 400, 'reset');
  if (pass.length < 6 || pass.length > 200) throw U.bad('Crie uma senha com pelo menos 6 caracteres.');
  const hash = await hashPass(pass);
  const id = U.sha256(token);
  const email = await db.write(async (t) => {
    const r = (await t.all('SELECT email, exp, used FROM pwreset WHERE id = ?', [id]))[0];
    if (!r || r.used || r.exp < Date.now()) throw U.bad('Este link não é válido ou já foi usado. Peça um novo.', 400, 'reset');
    await t.run('UPDATE pwreset SET used = ? WHERE id = ?', [Date.now(), id]);
    await t.run('UPDATE users SET pass_hash = ? WHERE email = ?', [hash, r.email]);
    await t.run('DELETE FROM sessions WHERE email = ?', [r.email]);
    await S.event(t, r.email, 'password_changed', {}, { force: true });
    return r.email;
  });
  clearHits('loginu:' + email);
  return { ok: true };
}

// ---------- administrador ----------
async function ensureAdmin() {
  if (!cfg.ADMIN_EMAIL || !cfg.ADMIN_PASSWORD) return false;
  const cur = await db.one("SELECT v FROM settings WHERE k = 'admin_hash'");
  const em = await db.one("SELECT v FROM settings WHERE k = 'admin_email'");
  if (!cur) {
    const h = await hashPass(cfg.ADMIN_PASSWORD);
    await db.write(async (t) => {
      await t.run("INSERT INTO settings (k, v) VALUES ('admin_hash', ?)", [h]);
      await t.run("INSERT INTO settings (k, v) VALUES ('admin_email', ?)", [cfg.ADMIN_EMAIL]);
    });
  } else if (!em) {
    await db.write((t) => t.run("INSERT INTO settings (k, v) VALUES ('admin_email', ?)", [cfg.ADMIN_EMAIL]));
  }
  return true;
}
async function adminLogin(req, res) {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  limit('adm:' + req.ip_, 10, 900e3);
  const em = await db.one("SELECT v FROM settings WHERE k = 'admin_email'");
  const h = await db.one("SELECT v FROM settings WHERE k = 'admin_hash'");
  const ok = await checkPass(String(b.pass || ''), h ? h.v : 's1$00$00');
  if (!em || !h || em.v !== email || !ok) throw U.bad('E-mail ou senha incorretos.', 401);
  await startSession(res, email, 'admin');
  return { email };
}
async function adminChangePassword(oldp, newp) {
  const h = await db.one("SELECT v FROM settings WHERE k = 'admin_hash'");
  if (!h || !(await checkPass(String(oldp || ''), h.v))) throw U.bad('A senha atual está incorreta.');
  if (String(newp || '').length < 8) throw U.bad('A nova senha precisa ter pelo menos 8 caracteres.');
  const nh = await hashPass(newp);
  await db.write((t) => t.run("UPDATE settings SET v = ? WHERE k = 'admin_hash'", [nh]));
}

module.exports = { COOKIE, hashPass, checkPass, startSession, endSession, loadSession, publicUser, register, login, forgot, reset, ensureAdmin, adminLogin, adminChangePassword, limit };
