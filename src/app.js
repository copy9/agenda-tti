'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const db = require('./db');
const U = require('./util');
const S = require('./store');
const A = require('./auth');
const V = require('./views');
const P = require('./policy');
const ADM = require('./admin');
const L = require('./legal');
const N = require('./notifier');
const PUSH = require('./push');
const T = require('./telemetry');
const { createApp } = require('./http');

const IDRE = /^[A-Za-z][A-Za-z0-9]{2,38}$/;

function build() {
  const app = createApp();

  // Sessão carregada em toda requisição.
  app.hooks.before.push(async (req) => { req.user = await A.loadSession(req); });
  const need = (req, ...roles) => {
    if (!req.user) throw U.bad('Sessão expirada. Entre de novo.', 401);
    if (roles.length && !roles.includes(req.user.role)) throw U.bad('Você não tem permissão para essa ação.', 403);
    if (req.user.needTerms) throw U.bad('Leia e aceite os Termos de uso e a Política de privacidade atualizados para continuar.', 403, 'terms');
  };
  // Para ações permitidas mesmo antes de aceitar os termos novos (aceitar, baixar os próprios dados, pedir exclusão).
  const needLogin = (req) => {
    if (!req.user || req.user.role === 'admin') throw U.bad('Sessão expirada. Entre de novo.', 401);
  };

  // ---------- página ----------
  let htmlCache = null; let htmlMtime = 0;
  function page(boot) {
    const st = fs.statSync(cfg.APP_FILE);
    if (!htmlCache || st.mtimeMs !== htmlMtime) { htmlCache = fs.readFileSync(cfg.APP_FILE, 'utf8'); htmlMtime = st.mtimeMs; }
    const json = JSON.stringify(boot || {}).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
    return htmlCache.replace('window.TTI_BOOT=null;', 'window.TTI_BOOT=' + json + ';');
  }
  const bootBase = (req) => ({ api: true, user: req.user ? A.publicUser(req.user) : null, terms: cfg.LEGAL_VERSION });

  app.get('/', (req, res) => res.html(200, page(bootBase(req))));

  // Link do convite: /?convite=<token>
  async function inviteInfo(token) {
    if (!/^[a-f0-9]{32}$/.test(String(token))) return null;
    const i = await db.one('SELECT * FROM invites WHERE token = ?', [token]);
    if (!i) return null;
    const h = await db.one('SELECT * FROM houses WHERE id = ?', [i.house_id]);
    const o = await db.one('SELECT name FROM users WHERE email = ?', [i.owner_email]);
    if (!h) return null;
    const exists = !!(await db.one("SELECT email FROM users WHERE email = ? AND role = 'broker'", [i.broker_email]));
    return { token, email: i.broker_email, house: h.id && U.parse(h.doc, {}).name, owner: o ? o.name : '', status: i.status, exists, otherRole: !exists && !!(await db.one('SELECT email FROM users WHERE email = ?', [i.broker_email])) };
  }
  app.get('/api/invites/:token', async (req, res) => {
    A.limit('inv:' + req.ip_, 60, 600e3);
    const i = await inviteInfo(req.params.token);
    if (!i) throw U.bad('Convite não encontrado ou removido.', 404);
    res.json(200, i);
  });

  // ---------- conta ----------
  app.post('/api/register', async (req, res) => res.json(200, { user: await A.register(req, res) }));
  app.post('/api/login', async (req, res) => res.json(200, { user: await A.login(req, res) }));
  app.post('/api/forgot', async (req, res) => res.json(200, await A.forgot(req)));
  app.post('/api/reset', async (req, res) => res.json(200, await A.reset(req, res)));
  app.post('/api/logout', async (req, res) => { await A.endSession(req, res); res.json(200, { ok: true }); });
  app.get('/api/session', (req, res) => res.json(200, { user: req.user ? A.publicUser(req.user) : null, rev: S.rev() }));

  // ---------- termos, privacidade e direitos do titular ----------
  const legalPage = (kind) => (req, res) => res.html(200, L.page(kind, req.query.lg));
  app.get('/termos', legalPage('terms'));
  app.get('/privacidade', legalPage('privacy'));
  app.post('/api/terms/accept', async (req, res) => {
    needLogin(req);
    A.limit('terms:' + req.user.email, 30, 3600e3);
    await L.accept(req.user, req.ip_, req.body.version);
    res.json(200, { ok: true, terms: L.termsState({ needTerms: false }) });
  });
  app.get('/api/me/export', async (req, res) => {
    needLogin(req);
    A.limit('export:' + req.user.email, 10, 3600e3);
    const d = await L.exportData(req.user);
    res.send(200, JSON.stringify(d, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="meus-dados-agenda-tti-' + U.today() + '.json"', 'Cache-Control': 'no-store' });
  });
  app.get('/api/me/delete', async (req, res) => { needLogin(req); res.json(200, await L.deleteStatus(req.user)); });
  app.post('/api/me/delete', async (req, res) => {
    needLogin(req);
    A.limit('mdel:' + req.user.email, 10, 3600e3);
    res.json(200, await L.requestDelete(req.user, req.body.pass, A.checkPass));
  });
  app.post('/api/me/delete/cancel', async (req, res) => { needLogin(req); res.json(200, await L.cancelDelete(req.user)); });
  app.get('/api/health', async (req, res) => { await db.one('SELECT 1 AS ok'); res.json(200, { ok: true, db: db.dialect }); });

  // ---------- avisos fora do site: preferências e push ----------
  const prefsOut = async (user) => {
    const p = await db.write((t) => S.prefsOf(t, user.email));
    const subs = await PUSH.subsOf(user.email);
    return { lang: p.lang, ch: p.ch, ev: p.ev, mail: !!cfg.SMTP_HOST, push: subs.length };
  };
  app.get('/api/me/prefs', async (req, res) => { need(req, 'owner', 'broker'); res.json(200, await prefsOut(req.user)); });
  app.post('/api/me/prefs', async (req, res) => {
    need(req, 'owner', 'broker');
    A.limit('prefs:' + req.user.email, 60, 3600e3);
    const b = req.body || {};
    await db.write((t) => S.setPrefs(t, req.user.email, { lang: b.lang, ch: b.ch, ev: b.ev }));
    res.json(200, await prefsOut(req.user));
  });
  app.get('/api/push/key', async (req, res) => { need(req, 'owner', 'broker'); res.json(200, { key: await PUSH.publicKey() }); });
  app.post('/api/push/subscribe', async (req, res) => {
    need(req, 'owner', 'broker');
    A.limit('psub:' + req.user.email, 30, 3600e3);
    await PUSH.subscribe(req.user.email, req.body);
    res.json(200, await prefsOut(req.user));
  });
  app.post('/api/push/unsubscribe', async (req, res) => {
    need(req, 'owner', 'broker');
    await PUSH.unsubscribe(req.user.email, req.body && req.body.endpoint);
    res.json(200, await prefsOut(req.user));
  });
  // Service worker do push: precisa ser servido na raiz para valer para o site todo.
  app.get('/sw.js', (req, res) => res.send(200, fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js')), { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }));

  // ---------- observabilidade ----------
  app.get('/metrics', (req, res) => {
    if (!cfg.METRICS_TOKEN) return res.json(404, { error: 'Não encontrado.' });
    if (!T.metricsAllowed(req)) return res.json(401, { error: 'Token inválido.' });
    res.send(200, T.renderMetrics(), { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' });
  });
  // O navegador reporta erros e Web Vitals. Respostas vazias; tudo é limitado, limpo e sem dados pessoais.
  app.post('/api/telemetry/error', (req, res) => {
    A.limit('terr:' + req.ip_, 30, 600e3);
    T.captureBrowserError(req.body);
    res.send(204, '');
  });
  app.post('/api/telemetry/vitals', (req, res) => {
    A.limit('tvit:' + req.ip_, 120, 600e3);
    T.recordVital(req.body);
    res.send(204, '');
  });

  // ---------- sincronização ----------
  app.get('/api/sync', async (req, res) => {
    need(req);
    if (req.query.since && Number(req.query.since) === S.rev()) return res.json(200, { rev: S.rev(), same: true });
    res.json(200, { rev: S.rev(), view: await V.viewFor(req.user) });
  });
  app.post('/api/sync', async (req, res) => {
    need(req);
    A.limit('sync:' + req.user.email, 300, 60e3);
    const ops = req.body && req.body.ops;
    if (!Array.isArray(ops) || ops.length > 200) throw U.bad('Pedido inválido.');
    if (req.user.role !== 'admin') {
      await db.write(async (t) => { await P.apply(t, req.user, ops); });
      S.bump();
    }
    res.json(200, { rev: S.rev(), view: await V.viewFor(req.user) });
  });

  // ---------- convites ----------
  app.post('/api/invites', async (req, res) => {
    need(req, 'owner');
    A.limit('invc:' + req.user.email, 60, 3600e3);
    const hid = String(req.body.hid || ''); const email = String(req.body.email || '').trim().toLowerCase();
    if (!IDRE.test(hid)) throw U.bad('Casa inválida.');
    if (!U.isEmail(email)) throw U.bad('Informe um e-mail válido.');
    if (email === req.user.email) throw U.bad('Use o e-mail do corretor, não o seu.');
    const base = cfg.PUBLIC_URL || (req.secure_ ? 'https://' : 'http://') + (req.headers.host || 'localhost');
    let mailOk = true;
    try { A.limit('invmail:' + req.user.email, 30, 864e5); } catch (e) { mailOk = false; } // trava de spam: no máximo 30 e-mails de convite por dia
    const out = await db.write(async (t) => {
      const h = await S.one(t, 'SELECT owner_email, doc FROM houses WHERE id = ?', [hid]);
      if (!h || h.owner_email !== req.user.email) throw U.bad('Casa não encontrada.', 404);
      const other = await S.one(t, 'SELECT role FROM users WHERE email = ?', [email]);
      if (other && other.role !== 'broker') throw U.bad('Este e-mail pertence a uma conta de proprietário.', 409);
      let i = await S.one(t, 'SELECT * FROM invites WHERE house_id = ? AND broker_email = ?', [hid, email]);
      if (i && i.status === 'accepted') throw U.bad('Este corretor já tem acesso a esta casa.', 409);
      if (!i) {
        i = { token: U.rid(16), house_id: hid, owner_email: req.user.email, broker_email: email, status: 'pending', created: Date.now(), accepted: 0 };
        await t.run('INSERT INTO invites (token, house_id, owner_email, broker_email, status, created, accepted) VALUES (?,?,?,?,?,?,?)', [i.token, hid, i.owner_email, email, 'pending', i.created, 0]);
        if (mailOk) await S.event(t, email, 'invite', { owner: req.user.name, house: U.parse(h.doc, {}).name, url: base + '/?convite=' + i.token, lang: (await S.prefsOf(t, req.user.email)).lang });
      }
      return i;
    });
    S.bump();
    res.json(200, { token: out.token, url: base + '/?convite=' + out.token, view: await V.viewFor(req.user), rev: S.rev() });
  });

  app.post('/api/invites/accept', async (req, res) => {
    need(req, 'broker');
    A.limit('inva:' + req.user.email, 30, 3600e3);
    const token = String(req.body.token || '');
    if (!/^[a-f0-9]{32}$/.test(token)) throw U.bad('Convite inválido.');
    await db.write(async (t) => {
      const i = await S.one(t, 'SELECT * FROM invites WHERE token = ?', [token]);
      if (!i) throw U.bad('Convite não encontrado ou removido.', 404);
      if (i.broker_email !== req.user.email) throw U.bad('Este convite foi enviado para outro e-mail (' + i.broker_email + ').', 403);
      if (i.status !== 'accepted') await t.run("UPDATE invites SET status = 'accepted', accepted = ? WHERE token = ?", [Date.now(), token]);
      const h = await S.one(t, 'SELECT doc FROM houses WHERE id = ?', [i.house_id]);
      await S.notify(t, i.owner_email, req.user.name + ' aceitou o convite para ' + (h ? U.parse(h.doc, {}).name : 'a casa'));
      if (i.status !== 'accepted') await S.event(t, i.owner_email, 'invite_accepted', { broker: req.user.name, house: h ? U.parse(h.doc, {}).name : '' });
    });
    S.bump();
    res.json(200, { ok: true, rev: S.rev(), view: await V.viewFor(req.user) });
  });

  // ---------- página pública da casa (para o cliente do corretor) ----------
  app.get('/api/public/house/:slug', async (req, res) => {
    A.limit('pub:' + req.ip_, 240, 600e3);
    const row = await db.one('SELECT * FROM houses WHERE slug = ?', [req.params.slug]);
    if (!row) throw U.bad('Esta casa não está disponível.', 404);
    const h = S.houseDoc(row);
    const out = {
      i: h.id, n: h.name, l: h.loc, hu: h.hue, q: h.q, s: h.s, b: h.b, lot: h.lot, v: h.v, a: h.a, po: h.pool, pe: h.pets, d: h.desc, am: h.am || [], ru: h.rules || '',
      ph: (h.photos || []).map((u, i) => ({ u, n: (h.cap && h.cap[i]) || 'Foto ' + (i + 1) })),
    };
    const code = String(req.query.b || '');
    if (/^[a-f0-9]{8}$/.test(code)) {
      const b = await db.one("SELECT name, wa FROM users WHERE code = ? AND role = 'broker' AND suspended = 0", [code]);
      if (b) { out.bn = b.name; if (b.wa) out.wa = b.wa; }
    }
    res.json(200, out);
  });
  // ---------- perfil público do corretor: as casas que ele gerencia (só as que o convidaram) ----------
  app.get('/api/public/broker/:code', async (req, res) => {
    A.limit('pubb:' + req.ip_, 240, 600e3);
    const code = String(req.params.code);
    const b = /^[a-f0-9]{8}$/.test(code) && await db.one("SELECT email, name, wa, info FROM users WHERE code = ? AND role = 'broker' AND suspended = 0", [code]);
    if (!b) throw U.bad('Este perfil não está disponível.', 404);
    const ids = (await db.all("SELECT house_id FROM invites WHERE broker_email = ? AND status = 'accepted'", [b.email])).map((r) => r.house_id);
    const hs = ids.length ? (await db.all(`SELECT * FROM houses WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map(S.houseDoc) : [];
    hs.sort((x, y) => String(x.name).localeCompare(String(y.name), 'pt'));
    // Só o que a página pública de cada casa já mostra. Nada do proprietário nem de outros corretores.
    const i = U.parse(b.info, null) || {};
    res.json(200, { bn: b.name, wa: b.wa || '', c: i.c || '', r: i.r || '', bi: i.b || '', hs: hs.slice(0, 60).map((h) => ({ pg: h.pg, n: h.name, l: h.loc, hu: h.hue, q: h.q, s: h.s, b: h.b, lot: h.lot, ph: (h.photos || [])[0] || '' })) });
  });
  app.get('/corretor/:code', (req, res) => res.html(200, page(Object.assign(bootBase(req), { prof: req.params.code }))));

  const spa = (req, res) => res.html(200, page(Object.assign(bootBase(req), { slug: req.params.slug, b: req.query.b || '' })));
  app.get('/c/:slug', spa);

  // ---------- fotos ----------
  app.get('/p/:id', async (req, res) => {
    if (!/^[a-f0-9]{40}$/.test(req.params.id)) return res.send(404, 'Não encontrada');
    const r = await db.one('SELECT mime, data FROM photos WHERE id = ?', [req.params.id]);
    if (!r) return res.send(404, 'Não encontrada');
    res.send(200, Buffer.from(r.data), { 'Content-Type': r.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
  });

  // ---------- administração ----------
  app.post('/api/admin/login', async (req, res) => res.json(200, { admin: await A.adminLogin(req, res) }));
  app.post('/api/admin/suspend', async (req, res) => { need(req, 'admin'); await ADM.setSuspended(req.body.email, !!req.body.on); S.bump(); res.json(200, { rev: S.rev(), view: await V.viewFor(req.user) }); });
  app.post('/api/admin/delete-user', async (req, res) => { need(req, 'admin'); await ADM.deleteUser(req.body.email); S.bump(); res.json(200, { rev: S.rev(), view: await V.viewFor(req.user) }); });
  app.post('/api/admin/delete-house', async (req, res) => { need(req, 'admin'); await ADM.deleteHouse(req.body.id); S.bump(); res.json(200, { rev: S.rev(), view: await V.viewFor(req.user) }); });
  app.post('/api/admin/cancel-proposal', async (req, res) => { need(req, 'admin'); await ADM.cancelProposal(req.body.id); S.bump(); res.json(200, { rev: S.rev(), view: await V.viewFor(req.user) }); });
  app.post('/api/admin/password', async (req, res) => { need(req, 'admin'); await A.adminChangePassword(req.body.old, req.body.new); res.json(200, { ok: true }); });
  app.get('/api/admin/backup', async (req, res) => {
    need(req, 'admin');
    const b = await ADM.backup();
    res.send(200, JSON.stringify(b), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="agenda-tti-backup-' + U.today() + '.json"', 'Cache-Control': 'no-store' });
  });

  // ---------- manutenção ----------
  async function tick() {
    try {
      const n = await db.write((t) => S.expireDue(t));
      if (n) S.bump();
      if (await L.processDue()) S.bump();
      await db.write((t) => S.remindDue(t));
      await N.purge();
    } catch (e) { T.captureException(e, { source: 'tick' }); }
  }
  app.tick = tick;
  app.drain = async () => { try { await N.drain(); } catch (e) { T.captureException(e, { source: 'drain' }); } };
  return app;
}
module.exports = { build };
