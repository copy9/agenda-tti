'use strict';
// Funções compartilhadas de acesso aos dados: casas, fotos, avisos, expiração de propostas.
const cfg = require('./config');
const db = require('./db');
const U = require('./util');

// Revisão global: sobe a cada gravação. O app consulta e só baixa os dados quando ela muda.
let REV = Date.now();
const rev = () => REV;
const bump = () => { REV += 1; return REV; };

const one = async (t, sql, p) => (await t.all(sql, p))[0] || null;

// ---------- texto seguro ----------
// Remove o que permite injetar HTML em páginas de outros usuários.
const safe = (v, max) => U.text(v, max).replace(/[<>"`]/g, '');

// ---------- casas ----------
const NUMS = { q: [0, 60], s: [0, 60], b: [0, 60], lot: [1, 200], v: [0, 60], rate: [0, 1e7], minN: [1, 60], minSp: [0, 60], adv: [0, 100], hue: [0, 360] };
const STRS = { name: 120, loc: 160, a: 30, pool: 200, pets: 40, desc: 3000, rules: 4000, cit: 10, cot: 10, acc: 600, wfn: 80, wfp: 80, ci: 3000, co: 3000 };

function cleanHouse(inc, prev) {
  const d = {};
  for (const k of Object.keys(STRS)) d[k] = safe(inc[k], STRS[k]).trim();
  for (const k of Object.keys(NUMS)) { const [lo, hi] = NUMS[k]; d[k] = Math.min(hi, Math.max(lo, U.num(inc[k], lo))); }
  d.adv = inc.adv == null ? (prev && prev.adv != null ? prev.adv : 50) : d.adv;
  d.am = (Array.isArray(inc.am) ? inc.am : []).filter((x) => typeof x === 'string' && /^[a-z0-9]{1,30}$/.test(x)).slice(0, 80);
  const rates = {};
  if (inc.rates && typeof inc.rates === 'object') {
    let n = 0;
    for (const k of Object.keys(inc.rates)) { if (U.isDate(k) && n++ < 1500) rates[k] = Math.min(1e7, Math.max(0, U.num(inc.rates[k], 0))); }
  }
  d.rates = rates;
  d.custom = true;
  return d;
}

const DATA_URI = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.length > 6 && buf.slice(0, 4).toString() === 'GIF8') return 'gif';
  return null;
}

// Converte as fotos recebidas (data URI ou /p/<id>) em links /p/<id> guardados no banco.
async function savePhotos(t, houseId, list) {
  const urls = [];
  const keep = new Set();
  for (const p of (Array.isArray(list) ? list : []).slice(0, 8)) {
    if (typeof p !== 'string') continue;
    const m = DATA_URI.exec(p);
    if (m) {
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > cfg.MAX_PHOTO_BYTES) throw U.bad('Uma das fotos é grande demais (máximo 1,5 MB).', 413);
      const kind = sniff(buf);
      if (!kind) throw U.bad('Formato de foto não aceito. Use JPG, PNG ou WebP.');
      const id = U.sha1(houseId + ':' + buf.toString('base64'));
      if (!(await one(t, 'SELECT id FROM photos WHERE id = ?', [id]))) {
        await t.run('INSERT INTO photos (id, house_id, mime, data, created) VALUES (?,?,?,?,?)', [id, houseId, 'image/' + kind, buf, Date.now()]);
      }
      keep.add(id); urls.push('/p/' + id);
    } else {
      const u = /^\/p\/([a-f0-9]{40})$/.exec(p);
      if (u && (await one(t, 'SELECT id FROM photos WHERE id = ? AND house_id = ?', [u[1], houseId]))) { keep.add(u[1]); urls.push(p); }
    }
  }
  const have = await t.all('SELECT id FROM photos WHERE house_id = ?', [houseId]);
  for (const r of have) if (!keep.has(r.id)) await t.run('DELETE FROM photos WHERE id = ?', [r.id]);
  return urls;
}

async function newSlug(t) {
  for (let i = 0; i < 10; i++) {
    const s = U.rid(4);
    if (!(await one(t, 'SELECT slug FROM houses WHERE slug = ?', [s]))) return s;
  }
  return U.rid(6);
}

const houseDoc = (row) => { const d = U.parse(row.doc, {}); d.id = row.id; d.owner = row.owner_email; d.pg = row.slug; return d; };

async function deleteHouse(t, id) {
  await t.run('DELETE FROM blocks WHERE house_id = ?', [id]);
  await t.run('DELETE FROM invites WHERE house_id = ?', [id]);
  await t.run('DELETE FROM proposals WHERE house_id = ?', [id]);
  await t.run('DELETE FROM photos WHERE house_id = ?', [id]);
  await t.run('DELETE FROM houses WHERE id = ?', [id]);
}

// ---------- relações ----------
async function related(t, a, b) {
  if (!a || !b || a === b) return false;
  const i = await one(t, 'SELECT 1 AS x FROM invites WHERE (owner_email = ? AND broker_email = ?) OR (owner_email = ? AND broker_email = ?)', [a, b, b, a]);
  if (i) return true;
  const p = await one(t, 'SELECT 1 AS x FROM proposals WHERE (owner_email = ? AND broker_email = ?) OR (owner_email = ? AND broker_email = ?)', [a, b, b, a]);
  return !!p;
}

// ---------- avisos ----------
async function notify(t, to, text, pid, at) {
  if (!to) return;
  const doc = { to, text: U.text(text, 300), pid: pid || undefined, at: at || Date.now(), read: false };
  await t.run('INSERT INTO notifications (id, to_email, at, doc) VALUES (?,?,?,?)', [U.rid(8), to, doc.at, JSON.stringify(doc)]);
  const old = await t.all('SELECT id FROM notifications WHERE to_email = ? ORDER BY at DESC', [to]);
  for (const r of old.slice(200)) await t.run('DELETE FROM notifications WHERE id = ?', [r.id]);
}

// ---------- consentimentos (termos e privacidade) ----------
async function consent(t, email, ip, version, kind) {
  await t.run('INSERT INTO consents (id, email, kind, version, at, ip_hash) VALUES (?,?,?,?,?,?)', [U.rid(8), email, kind || 'terms', version, Date.now(), U.sha256(String(ip || ''))]);
}

// ---------- propostas ----------
const isOpen = (s) => s === 'pending' || s === 'countered';
async function saveProposal(t, doc, houseId, broker, owner) {
  const j = JSON.stringify(doc);
  const r = await t.run('UPDATE proposals SET status = ?, doc = ?, updated = ? WHERE id = ?', [doc.status, j, Date.now(), doc.id]);
  if (!r.changes) await t.run('INSERT INTO proposals (id, house_id, broker_email, owner_email, status, doc, updated) VALUES (?,?,?,?,?,?,?)', [doc.id, houseId, broker, owner, doc.status, j, Date.now()]);
}

// Marca como expiradas as propostas em aberto com prazo vencido (48h).
async function expireDue(t) {
  const rows = await t.all("SELECT * FROM proposals WHERE status IN ('pending','countered')");
  let n = 0;
  for (const r of rows) {
    const d = U.parse(r.doc, null);
    if (!d || !d.exp || d.exp >= Date.now()) continue;
    d.status = 'expired';
    d.log = d.log || [];
    d.log.push({ d: U.today(), s: 'expired', v: d.value });
    await saveProposal(t, d, r.house_id, r.broker_email, r.owner_email);
    await notify(t, r.broker_email, 'A proposta para ' + d.house + ' expirou sem resposta', d.id);
    await notify(t, r.owner_email, 'A proposta de ' + d.bname + ' para ' + d.house + ' expirou', d.id);
    n++;
  }
  return n;
}

async function readBlocks(t, houseId) {
  const r = await one(t, 'SELECT dates FROM blocks WHERE house_id = ?', [houseId]);
  return r ? U.parse(r.dates, []) : [];
}
async function writeBlocks(t, houseId, dates) {
  const arr = [...new Set((dates || []).filter(U.isDate))].sort().slice(0, 3000);
  const j = JSON.stringify(arr);
  const r = await t.run('UPDATE blocks SET dates = ? WHERE house_id = ?', [j, houseId]);
  if (!r.changes) await t.run('INSERT INTO blocks (house_id, dates) VALUES (?,?)', [houseId, j]);
}

module.exports = { rev, bump, one, safe, cleanHouse, savePhotos, newSlug, houseDoc, deleteHouse, related, notify, consent, isOpen, saveProposal, expireDue, readBlocks, writeBlocks, NUMS, STRS };
