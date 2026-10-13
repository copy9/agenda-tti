'use strict';
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const { test, assert, db, Client, signup, house, D } = require('./helpers');
const cfg = require('../src/config');
const S = require('../src/store');
const M = require('../src/msgs');
const mail = require('../src/mail');
const push = require('../src/push');
const N = require('../src/notifier');

// ---------- SMTP falso ----------
function fakeSmtp() {
  const got = []; const st = { failRcpt: false, auth: [] };
  const srv = net.createServer((sock) => {
    let buf = ''; let data = false; let cur = { from: '', to: '', body: '' };
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      for (;;) {
        if (data) {
          const i = buf.indexOf('\r\n.\r\n');
          if (i < 0) break;
          cur.body = buf.slice(0, i).replace(/\r\n\.\./g, '\r\n.'); buf = buf.slice(i + 5); data = false; got.push(cur); cur = { from: '', to: '', body: '' };
          sock.write('250 queued\r\n'); continue;
        }
        const j = buf.indexOf('\r\n');
        if (j < 0) break;
        const line = buf.slice(0, j); buf = buf.slice(j + 2);
        if (/^EHLO/i.test(line)) sock.write('250-fake\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH PLAIN /i.test(line)) { st.auth.push(Buffer.from(line.slice(11), 'base64').toString('utf8')); sock.write('235 ok\r\n'); }
        else if (/^MAIL FROM:/i.test(line)) { cur.from = /<(.*)>/.exec(line)[1]; sock.write('250 ok\r\n'); }
        else if (/^RCPT TO:/i.test(line)) { if (st.failRcpt) sock.write('451 try later\r\n'); else { cur.to = /<(.*)>/.exec(line)[1]; sock.write('250 ok\r\n'); } }
        else if (/^DATA/i.test(line)) { data = true; sock.write('354 go\r\n'); }
        else if (/^QUIT/i.test(line)) { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 ?\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, got, st, port: srv.address().port })));
}
function parseMail(m) {
  const [head, ...rest] = m.body.split('\r\n\r\n');
  const h = {}; head.replace(/\r\n[ \t]/g, ' ').split('\r\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) h[l.slice(0, i).toLowerCase()] = l.slice(i + 1).trim(); });
  const parts = {};
  rest.join('\r\n\r\n').split(/--tti_[a-f0-9]+/).forEach((p) => {
    const mm = /Content-Type: (text\/\w+); charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*)/.exec(p.trim());
    if (mm) parts[mm[1]] = Buffer.from(mm[2].replace(/\s/g, ''), 'base64').toString('utf8');
  });
  const subj = /^=\?UTF-8\?B\?(.+)\?=$/.exec(h.subject || '');
  return { h, subject: subj ? Buffer.from(subj[1], 'base64').toString('utf8') : h.subject, text: parts['text/plain'], html: parts['text/html'] };
}

// ---------- serviço de push falso (com a chave do "navegador" para decifrar) ----------
function fakePushService() {
  const got = []; const st = { status: 201 };
  const srv = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => { got.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.statusCode = st.status; res.end(); });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, got, st, port: srv.address().port })));
}
const hk = (ikm, salt, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, n));
// Lado do navegador (RFC 8291 §4), escrito à parte para conferir o formato.
function browserDecrypt(body, ua, authSecret) {
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
  const ikm = hk(ua.computeSecret(asPub), authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32);
  const cek = hk(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16); const nonce = hk(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'delimitador do último registro');
  return plain.subarray(0, plain.length - 1).toString('utf8');
}
function newBrowserSub(port) {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ua, auth, sub: { endpoint: `http://127.0.0.1:${port}/push/${crypto.randomBytes(6).toString('hex')}`, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}

let smtp; let ps;
const rows = (where, p) => db.all(`SELECT * FROM outbox WHERE ${where} ORDER BY created`, p || []);
const drain = async () => { await db.run('UPDATE outbox SET next_at = 0 WHERE status = ?', ['pending']); return N.drain(100); };

test.before(async () => {
  smtp = await fakeSmtp(); ps = await fakePushService();
  Object.assign(cfg, { SMTP_HOST: '127.0.0.1', SMTP_PORT: smtp.port, SMTP_SECURITY: 'none', SMTP_USER: 'robo', SMTP_PASS: 'segredo', MAIL_FROM: 'Agenda TTI <avisos@tti.test>', PUSH_ALLOW_INSECURE: true, PUBLIC_URL: 'https://tti.test' });
});
test.after(() => { smtp.srv.close(); ps.srv.close(); });

test('mensagem de e-mail: cabeçalhos limpos, UTF-8 e envio por SMTP com autenticação', async () => {
  const raw = mail.build({ to: 'ana@x.com', subject: 'Olá, ação!\r\nBcc: espiao@x.com', text: 'Corpo com acentuação\n.linha com ponto', html: '<p>oi</p>' });
  assert.ok(!/^Bcc:/mi.test(raw), 'sem injeção de cabeçalho');
  assert.equal((raw.match(/^Subject:/gm) || []).length, 1);
  await mail.send({ to: 'ana@x.com', subject: 'Olá, ação!', text: 'Corpo com acentuação\n.linha com ponto', html: '<p>oi</p>' });
  const m = smtp.got.at(-1);
  assert.equal(m.to, 'ana@x.com'); assert.equal(m.from, 'avisos@tti.test'); assert.deepEqual(smtp.st.auth.at(-1), '\0robo\0segredo');
  const p = parseMail(m);
  assert.equal(p.subject, 'Olá, ação!'); assert.equal(p.text, 'Corpo com acentuação\n.linha com ponto'); assert.equal(p.html, '<p>oi</p>');
  assert.equal(p.h.to, 'ana@x.com'); assert.match(p.h['message-id'], /^<[a-f0-9]+@tti\.test>$/);
  await assert.rejects(() => mail.send({ to: 'ruim', subject: 'x', text: 'x' }), /Destinatário inválido/);
});

test('textos: 3 idiomas, valores e datas formatados, aviso a corretor nunca cita outro corretor', () => {
  for (const [kind, K] of Object.entries(M.KINDS)) {
    for (const lang of M.LANGS) {
      const r = M.render(kind, lang, { house: 'Casa Azul', owner: 'Dono', broker: 'NOME-DE-CORRETOR', in: '2026-11-01', out: '2026-11-04', value: 9000, hours: 6, url: 'https://x.test/?convite=abc' }, 'https://x.test');
      assert.ok(r.subject && r.body && r.html.includes('Agenda TTI'), `${kind}/${lang}`);
      assert.ok(!/\{\w+\}/.test(r.subject + r.body), `marcador sem preencher em ${kind}/${lang}`);
      if (K.to === 'broker') assert.ok(!r.text.includes('NOME-DE-CORRETOR'), `${kind}/${lang} cita corretor`);
    }
  }
  const pt = M.render('proposal_new', 'pt', { house: 'Casa Azul', broker: 'Ana', in: '2026-11-01', out: '2026-11-04', value: 9000 });
  assert.equal(pt.body, 'Ana enviou uma proposta para Casa Azul, de 1 nov 2026 a 4 nov 2026, no valor de R$ 9.000. Responda em até 48 horas.');
  assert.match(M.render('proposal_new', 'en', { house: 'H', broker: 'Ana', in: '2026-11-01', out: '2026-11-04', value: 9000 }).body, /from Nov 1, 2026 to Nov 4, 2026, for R\$ 9,000/);
  assert.equal(M.render('proposal_new', 'xx', { house: 'H' }).lang, 'pt');
  assert.ok(M.render('proposal_new', 'pt', { house: '<b>x</b>' }).html.includes('&lt;b&gt;x&lt;/b&gt;'), 'HTML escapado');
});

test('push: criptografia confere com o vetor do RFC 8291 e decifra do lado do navegador', () => {
  const v = push.encrypt('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', { priv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw' }).toString('base64url');
  // Vetor da seção 5 do RFC (cabeçalho, chave pública, texto cifrado e quase toda a etiqueta).
  const rfc = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-';
  assert.ok(v.startsWith(rfc), 'saída difere do vetor do RFC 8291');
  assert.equal(v.length, 192);
  const b = newBrowserSub(1);
  const msg = JSON.stringify({ title: 'Olá ação', body: 'x'.repeat(500) });
  assert.equal(browserDecrypt(push.encrypt(msg, b.sub.keys.p256dh, b.sub.keys.auth), b.ua, b.auth), msg);
  assert.throws(() => push.encrypt('x', 'AAAA', b.sub.keys.auth), /inválidas/);
  assert.throws(() => push.encrypt('x'.repeat(5000), b.sub.keys.p256dh, b.sub.keys.auth), /grande demais/);
});

test('push: só aceita serviços de push conhecidos, em https (proteção contra SSRF)', () => {
  cfg.PUSH_ALLOW_INSECURE = false;
  try {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://web.push.apple.com/x']) assert.ok(push.endpointOk(ok), ok);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'javascript:alert(1)', 'nao-e-url', '']) assert.ok(!push.endpointOk(bad), bad);
    cfg.PUSH_HOSTS = ['push.meuservico.com'];
    assert.ok(push.endpointOk('https://push.meuservico.com/x'));
  } finally { cfg.PUSH_HOSTS = []; cfg.PUSH_ALLOW_INSECURE = true; }
});

test('fluxo completo: convite, proposta, aceite e proposta encerrada geram e-mails certos, sem vazar corretores', async () => {
  const dono = await signup('owner', 'n-dono@x.com', 'Dona Marta');
  const b1 = await signup('broker', 'n-b1@x.com', 'Beto Corretor');
  const b2 = await signup('broker', 'n-b2@x.com', 'Carla Corretora', { lang: 'en' });
  await dono.sync([{ c: 'houses', up: [house('hNOT1', { name: 'Casa Azul' })] }]);
  const before = smtp.got.length;
  const inv = await dono.post('/api/invites', { hid: 'hNOT1', email: 'n-b1@x.com' });
  await dono.post('/api/invites', { hid: 'hNOT1', email: 'n-b2@x.com' });
  await dono.post('/api/invites', { hid: 'hNOT1', email: 'novo-sem-conta@x.com' });
  await b1.post('/api/invites/accept', { token: inv.j.token });
  const t2 = (await dono.get('/api/sync')).j.view.inv.hNOT1.find((i) => i.email === 'n-b2@x.com').tok;
  await b2.post('/api/invites/accept', { token: t2 });
  await drain();
  const mails = smtp.got.slice(before).map((m) => Object.assign(m, parseMail(m)));
  const to = (e) => mails.filter((m) => m.to === e);
  assert.equal(to('n-b1@x.com').length, 1);
  assert.equal(to('n-b1@x.com')[0].subject, 'Dona Marta convidou você para a casa Casa Azul');
  assert.ok(to('n-b1@x.com')[0].text.includes('https://tti.test/?convite=' + inv.j.token));
  assert.match(to('n-b2@x.com')[0].subject, /Dona Marta convidou você|invited you/, 'convite sai no idioma do proprietário (ainda sem preferência do corretor)');
  assert.equal(to('novo-sem-conta@x.com').length, 1, 'convite chega também a quem ainda não tem conta');
  assert.equal(to('n-dono@x.com').filter((m) => /aceitou o convite/.test(m.subject)).length, 2);

  const n0 = smtp.got.length;
  const d1 = D(60); const d2 = D(63);
  await b1.sync([{ c: 'props', up: [{ id: 'p' + Date.now(), hid: 'rhNOT1', house: 'Casa Azul', broker: 'n-b1@x.com', bname: 'Beto Corretor', in: d1, out: d2, value: 9000, guest: 'Cliente', pax: 2, status: 'pending' }] }]);
  await b2.sync([{ c: 'props', up: [{ id: 'q' + Date.now(), hid: 'rhNOT1', house: 'Casa Azul', broker: 'n-b2@x.com', bname: 'Carla Corretora', in: D(61), out: D(64), value: 8000, guest: 'Y', pax: 2, status: 'pending' }] }]);
  const view = (await dono.get('/api/sync')).j.view;
  assert.equal(view.props.length, 1, 'a segunda proposta (datas em conflito) não existe');
  await drain();
  const novo = smtp.got.slice(n0).map(parseMail);
  assert.equal(novo.length, 1);
  assert.equal(novo[0].subject, 'Nova proposta para Casa Azul');
  assert.match(novo[0].text, /Beto Corretor enviou uma proposta para Casa Azul.*R\$ 9\.000/);
  assert.equal(smtp.got.at(-1).to, 'n-dono@x.com');

  const pid = view.props[0].id; const n1 = smtp.got.length;
  await dono.sync([{ c: 'props', up: [Object.assign({}, view.props[0], { status: 'accepted', final: 9000 })] }]);
  await drain();
  const aceite = smtp.got.slice(n1).map((m) => Object.assign(m, parseMail(m)));
  assert.equal(aceite.length, 1);
  assert.equal(aceite[0].to, 'n-b1@x.com'); assert.equal(aceite[0].subject, 'Sua proposta para Casa Azul foi aceita');
  for (const m of aceite) for (const s of ['Carla', 'n-b2@x.com']) assert.ok(!m.body.includes(s), 'vazou outro corretor');
  assert.ok(pid);

  // privacidade: nenhum aviso dirigido a corretor cita o outro
  const brokerRows = await rows("to_email IN ('n-b1@x.com','n-b2@x.com')");
  for (const r of brokerRows) { const t = r.doc; const other = r.to_email === 'n-b1@x.com' ? ['Carla', 'n-b2@x.com'] : ['Beto', 'n-b1@x.com']; for (const s of other) assert.ok(!t.includes(s), `${r.kind} para ${r.to_email} cita ${s}`); }
});

test('preferências: canal, tipo de aviso e idioma do destinatário', async () => {
  const dono = await signup('owner', 'p-dono@x.com', 'Dono P');
  const b = await signup('broker', 'p-b@x.com', 'Corretor P', { lang: 'es' });
  assert.equal((await b.get('/api/me/prefs')).j.lang, 'es');
  assert.equal((await new Client().get('/api/me/prefs')).status, 401);
  await dono.sync([{ c: 'houses', up: [house('hPRF1')] }]);
  const t = (await dono.post('/api/invites', { hid: 'hPRF1', email: 'p-b@x.com' })).j.token;
  await b.post('/api/invites/accept', { token: t });
  await drain();
  const mk = (id, v, extra) => ({ id, hid: 'rhPRF1', house: 'Casa hPRF1', broker: 'p-b@x.com', bname: 'Corretor P', in: D(v), out: D(v + 2), value: 5000, guest: 'G', pax: 2, status: 'pending', ...extra });

  const r0 = (await rows("to_email = 'p-dono@x.com'")).length;
  await b.sync([{ c: 'props', up: [mk('p' + Date.now(), 70)] }]);
  assert.equal((await rows("to_email = 'p-dono@x.com'")).length, r0 + 1, 'padrão: avisa');
  await dono.post('/api/me/prefs', { ev: { proposal: false } });
  await b.sync([{ c: 'props', up: [mk('p' + (Date.now() + 1), 75)] }]);
  assert.equal((await rows("to_email = 'p-dono@x.com'")).length, r0 + 1, 'tipo desligado: não avisa');
  await dono.post('/api/me/prefs', { ev: { proposal: true }, ch: 'none' });
  await b.sync([{ c: 'props', up: [mk('p' + (Date.now() + 2), 80)] }]);
  assert.equal((await rows("to_email = 'p-dono@x.com'")).length, r0 + 1, 'canal nenhum: não avisa');
  const bad = await dono.post('/api/me/prefs', { ch: 'sms', lang: 'zz', ev: { proposal: 'sim' } });
  assert.equal(bad.j.ch, 'none', 'valor inválido é ignorado'); assert.equal(bad.j.lang, 'pt');

  // resposta do proprietário ao corretor vai em espanhol (idioma do corretor)
  await dono.post('/api/me/prefs', { ch: 'both' });
  const props = (await dono.get('/api/sync')).j.view.props.filter((p) => p.status === 'pending');
  await dono.sync([{ c: 'props', up: [Object.assign({}, props[0], { status: 'rejected' })] }]);
  const last = (await rows("to_email = 'p-b@x.com' AND kind = 'proposal_declined'")).at(-1);
  assert.ok(last, 'aviso de recusa criado');
  assert.match(JSON.parse(last.doc).subject, /fue rechazada/);
});

test('push: inscrição, envio cifrado com assinatura VAPID e limpeza de inscrição morta', async () => {
  const dono = await signup('owner', 'ps-dono@x.com', 'Dono Push');
  const b = await signup('broker', 'ps-b@x.com', 'Corretor Push');
  const key = (await dono.get('/api/push/key')).j.key;
  assert.equal(Buffer.from(key, 'base64url').length, 65);
  const br = newBrowserSub(ps.port);
  cfg.PUSH_ALLOW_INSECURE = false;
  assert.equal((await dono.post('/api/push/subscribe', { endpoint: 'https://evil.example.com/x', keys: br.sub.keys })).status, 400);
  assert.equal((await dono.post('/api/push/subscribe', br.sub)).status, 400, 'http local não vale em produção');
  cfg.PUSH_ALLOW_INSECURE = true;
  assert.equal((await dono.post('/api/push/subscribe', { endpoint: br.sub.endpoint, keys: { p256dh: 'AAAA', auth: 'AAAA' } })).status, 400);
  assert.equal((await new Client().post('/api/push/subscribe', br.sub)).status, 401);
  const r = await dono.post('/api/push/subscribe', br.sub);
  assert.equal(r.status, 200); assert.equal(r.j.push, 1);
  assert.equal((await dono.post('/api/push/subscribe', br.sub)).j.push, 1, 'mesma inscrição não duplica');

  await dono.sync([{ c: 'houses', up: [house('hPSH1', { name: 'Casa Push' })] }]);
  const t = (await dono.post('/api/invites', { hid: 'hPSH1', email: 'ps-b@x.com' })).j.token;
  await b.post('/api/invites/accept', { token: t });
  await drain();
  const before = ps.got.length;
  await b.sync([{ c: 'props', up: [{ id: 'p' + Date.now(), hid: 'rhPSH1', house: 'Casa Push', broker: 'ps-b@x.com', bname: 'Corretor Push', in: D(90), out: D(93), value: 7000, guest: 'G', pax: 2, status: 'pending' }] }]);
  await drain();
  assert.equal(ps.got.length, before + 1);
  const req = ps.got.at(-1);
  assert.equal(req.headers['content-encoding'], 'aes128gcm'); assert.equal(req.headers.ttl, '86400');
  const payload = JSON.parse(browserDecrypt(req.body, br.ua, br.auth));
  assert.equal(payload.title, 'Nova proposta para Casa Push'); assert.match(payload.body, /Corretor Push enviou uma proposta/);
  // assinatura VAPID (ES256) confere com a chave pública que o navegador recebeu
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(req.headers.authorization);
  assert.ok(m && m[4] === key, 'cabeçalho VAPID');
  const claims = JSON.parse(Buffer.from(m[2], 'base64url'));
  assert.equal(claims.aud, `http://127.0.0.1:${ps.port}`); assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 13 * 3600); assert.match(claims.sub, /^(mailto:|https?:)/);
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(key, 'base64url').subarray(1, 33).toString('base64url'), y: Buffer.from(key, 'base64url').subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')), 'assinatura inválida');
  // o corretor sem inscrição não recebe push
  assert.equal((await rows("to_email = 'ps-b@x.com' AND channel = 'push'")).length, 0);

  // serviço responde 410: inscrição é apagada
  ps.st.status = 410;
  await b.sync([{ c: 'props', up: [{ id: 'p' + (Date.now() + 5), hid: 'rhPSH1', house: 'Casa Push', broker: 'ps-b@x.com', bname: 'Corretor Push', in: D(100), out: D(102), value: 7000, guest: 'G', pax: 2, status: 'pending' }] }]);
  await drain();
  ps.st.status = 201;
  assert.equal((await dono.get('/api/me/prefs')).j.push, 0, 'inscrição morta removida');
  const again = await dono.post('/api/push/subscribe', br.sub);
  assert.equal(again.j.push, 1);
  assert.equal((await dono.post('/api/push/unsubscribe', { endpoint: br.sub.endpoint })).j.push, 0);
});

test('fila: tentativas com espera crescente, falha definitiva registrada e limpeza antiga', async () => {
  const dono = await signup('owner', 'f-dono@x.com', 'Dono F');
  await signup('broker', 'f-b@x.com', 'Corretor F');
  await dono.sync([{ c: 'houses', up: [house('hFIL1')] }]);
  smtp.st.failRcpt = true;
  await dono.post('/api/invites', { hid: 'hFIL1', email: 'f-b@x.com' });
  const [r] = await rows("to_email = 'f-b@x.com' AND kind = 'invite'");
  assert.equal(r.status, 'pending');
  await N.drain();
  let cur = (await rows('id = ?', [r.id]))[0];
  assert.equal(cur.attempts, 1); assert.equal(cur.status, 'pending'); assert.ok(Number(cur.next_at) > Date.now() + 30e3, 'espera antes de tentar de novo');
  assert.match(cur.last_error, /451/);
  assert.equal(await N.drain(), 0, 'ainda dentro da espera');
  for (let i = 1; i < cfg.OUTBOX_MAX_ATTEMPTS; i++) await drain();
  cur = (await rows('id = ?', [r.id]))[0];
  assert.equal(cur.status, 'failed'); assert.equal(cur.attempts, cfg.OUTBOX_MAX_ATTEMPTS);
  assert.ok(!cur.last_error.includes('f-b@x.com'), 'e-mail mascarado no erro registrado');
  smtp.st.failRcpt = false;
  assert.equal(await drain(), 0, 'falha definitiva não volta para a fila');
  await db.run('UPDATE outbox SET created = ? WHERE id = ?', [Date.now() - 31 * 864e5, r.id]);
  assert.ok((await N.purge()) >= 1);
  assert.equal((await rows('id = ?', [r.id])).length, 0);
});

test('sem SMTP configurado nenhum e-mail entra na fila; convite continua gerando o link', async () => {
  const host = cfg.SMTP_HOST; cfg.SMTP_HOST = '';
  try {
    const dono = await signup('owner', 'ns-dono@x.com', 'Dono NS');
    await dono.sync([{ c: 'houses', up: [house('hNOS1')] }]);
    const r = await dono.post('/api/invites', { hid: 'hNOS1', email: 'ns-b@x.com' });
    assert.equal(r.status, 200); assert.match(r.j.url, /\/\?convite=[a-f0-9]{32}$/);
    assert.equal((await rows("to_email = 'ns-b@x.com'")).length, 0);
  } finally { cfg.SMTP_HOST = host; }
});

test('lembrete 6 horas antes de vencer: vai a quem deve responder, uma vez só', async () => {
  const dono = await signup('owner', 'l-dono@x.com', 'Dono L');
  const b = await signup('broker', 'l-b@x.com', 'Corretor L');
  await dono.sync([{ c: 'houses', up: [house('hLEM1', { name: 'Casa Lembrete' })] }]);
  await b.post('/api/invites/accept', { token: (await dono.post('/api/invites', { hid: 'hLEM1', email: 'l-b@x.com' })).j.token });
  const id = 'p' + Date.now();
  await b.sync([{ c: 'props', up: [{ id, hid: 'rhLEM1', house: 'Casa Lembrete', broker: 'l-b@x.com', bname: 'Corretor L', in: D(120), out: D(123), value: 5000, guest: 'G', pax: 2, status: 'pending' }] }]);
  const setExp = async (ms) => { const r = await db.one('SELECT doc FROM proposals WHERE id = ?', [id]); const d = JSON.parse(r.doc); d.exp = Date.now() + ms; delete d.rem6; await db.run('UPDATE proposals SET doc = ? WHERE id = ?', [JSON.stringify(d), id]); };
  const count = () => rows("kind = 'proposal_expiring' AND doc LIKE '%Casa Lembrete%'");
  await setExp(20 * 36e5);
  assert.equal(await db.write((t) => S.remindDue(t)), 0, 'ainda falta muito');
  await setExp(5 * 36e5);
  assert.equal(await db.write((t) => S.remindDue(t)), 1);
  assert.equal(await db.write((t) => S.remindDue(t)), 0, 'só uma vez');
  const [row] = await count();
  assert.equal(row.to_email, 'l-dono@x.com'); assert.match(JSON.parse(row.doc).subject, /vence em [56] h/);
  // contraproposta: o lembrete vai ao corretor
  const v = (await dono.get('/api/sync')).j.view.props.find((p) => p.id === id);
  await dono.sync([{ c: 'props', up: [Object.assign({}, v, { status: 'countered', counter: 4800 })] }]);
  await setExp(4 * 36e5);
  assert.equal(await db.write((t) => S.remindDue(t)), 1);
  assert.equal((await count()).at(-1).to_email, 'l-b@x.com');
  // vencida: expira e avisa os dois
  await setExp(-1000);
  assert.equal(await db.write((t) => S.expireDue(t)), 1);
  assert.equal((await rows("kind = 'proposal_expired' AND doc LIKE '%Casa Lembrete%'")).length, 2);
});

test('service worker do push é servido na raiz e só mostra aviso e abre o site', async () => {
  const r = await new Client().get('/sw.js');
  assert.equal(r.status, 200); assert.equal(r.headers.get('service-worker-allowed'), '/'); assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(r.txt, /addEventListener\('push'/); assert.match(r.txt, /notificationclick/); assert.ok(!/caches\./.test(r.txt), 'não guarda nada em cache');
});
