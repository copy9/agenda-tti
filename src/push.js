'use strict';
// Web Push sem dependências: chaves VAPID (RFC 8292), criptografia de conteúdo aes128gcm (RFC 8291) e envio (RFC 8030).
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const U = require('./util');

const b64u = (b) => Buffer.from(b).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');

// ---------- chaves VAPID: geradas uma vez e guardadas no banco ----------
let VAPID = null;
async function vapid() {
  if (VAPID) return VAPID;
  const row = await db.one("SELECT v FROM settings WHERE k = 'vapid'");
  let jwk = row && U.parse(row.v, null);
  if (!jwk || !jwk.d) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    jwk = privateKey.export({ format: 'jwk' });
    await db.write(async (t) => {
      const had = (await t.all("SELECT v FROM settings WHERE k = 'vapid'"))[0];
      if (had) jwk = U.parse(had.v, jwk); else await t.run("INSERT INTO settings (k, v) VALUES ('vapid', ?)", [JSON.stringify(jwk)]);
    });
  }
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]); // ponto não comprimido (65 bytes)
  VAPID = { key, pub: b64u(pub) };
  return VAPID;
}
async function publicKey() { return (await vapid()).pub; }

function subject() {
  if (cfg.VAPID_SUBJECT) return cfg.VAPID_SUBJECT;
  const c = cfg.LEGAL_CONTACT || cfg.ADMIN_EMAIL;
  return c ? 'mailto:' + c : cfg.PUBLIC_URL || 'mailto:admin@localhost';
}

async function vapidHeader(endpoint) {
  const v = await vapid();
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject() }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: v.key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + v.pub;
}

// ---------- criptografia do conteúdo (aes128gcm) ----------
function encrypt(payload, p256dh, auth) {
  const ua = unb64u(p256dh); const authSecret = unb64u(auth);
  if (ua.length !== 65 || ua[0] !== 4 || authSecret.length < 16) throw new Error('Chaves da inscrição inválidas.');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const data = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]); // 0x02 = último (e único) registro
  if (data.length > 4096 - 17) throw new Error('Mensagem grande demais para o push.');
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

// ---------- endereço da inscrição: evita que o servidor chame qualquer URL (SSRF) ----------
const KNOWN = ['fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];
const privateHost = (h) => /^(localhost|.*\.local|.*\.internal)$/i.test(h) || /^(\[.*\]|\d+\.\d+\.\d+\.\d+)$/.test(h);
function endpointOk(url) {
  let u; try { u = new URL(String(url)); } catch (e) { return false; }
  if (String(url).length > 1000) return false;
  if (cfg.PUSH_ALLOW_INSECURE) return /^https?:$/.test(u.protocol);
  if (u.protocol !== 'https:' || u.username || u.password || privateHost(u.hostname)) return false;
  const h = u.hostname.toLowerCase();
  return KNOWN.concat(cfg.PUSH_HOSTS).some((k) => h === k || h.endsWith('.' + k));
}

// ---------- inscrições ----------
async function subscribe(email, sub) {
  const endpoint = sub && sub.endpoint; const keys = (sub && sub.keys) || {};
  if (!endpointOk(endpoint)) throw U.bad('Este navegador usa um serviço de push que não é aceito.');
  const k = unb64u(keys.p256dh || ''); const a = unb64u(keys.auth || '');
  if (k.length !== 65 || a.length < 16 || a.length > 32) throw U.bad('Inscrição de push inválida.');
  const id = U.sha256(endpoint);
  await db.write(async (t) => {
    await t.run('DELETE FROM push_subs WHERE id = ?', [id]);
    await t.run('INSERT INTO push_subs (id, email, endpoint, p256dh, auth, created) VALUES (?,?,?,?,?,?)', [id, email, endpoint, keys.p256dh, keys.auth, Date.now()]);
    const mine = await t.all('SELECT id FROM push_subs WHERE email = ? ORDER BY created DESC', [email]);
    for (const r of mine.slice(10)) await t.run('DELETE FROM push_subs WHERE id = ?', [r.id]);
  });
}
async function unsubscribe(email, endpoint) {
  await db.write((t) => t.run('DELETE FROM push_subs WHERE id = ? AND email = ?', [U.sha256(String(endpoint || '')), email]));
}
const subsOf = (email) => db.all('SELECT id, endpoint, p256dh, auth FROM push_subs WHERE email = ?', [email]);

// Envia a uma inscrição. Devolve 'ok', 'gone' (inscrição morta, apagar) ou lança erro (tentar de novo depois).
async function send(sub, message, ttl = 86400) {
  const body = encrypt(JSON.stringify(message), sub.p256dh, sub.auth);
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(sub.endpoint, {
      method: 'POST', body, signal: ctl.signal, redirect: 'error',
      headers: { Authorization: await vapidHeader(sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'normal' },
    });
    if (r.status === 404 || r.status === 410) return 'gone';
    if (!r.ok) throw new Error('Push ' + r.status);
    return 'ok';
  } finally { clearTimeout(tm); }
}

module.exports = { publicKey, subscribe, unsubscribe, subsOf, send, encrypt, endpointOk, vapidHeader, vapid };
