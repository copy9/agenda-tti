'use strict';
// Funções compartilhadas de acesso aos dados: casas, fotos, avisos, expiração de propostas.
const cfg = require('./config');
const db = require('./db');
const U = require('./util');
const M = require('./msgs');

// Revisão global: sobe a cada gravação. O app consulta e só baixa os dados quando ela muda.
let REV = Date.now();
const rev = () => REV;
const bump = () => { REV += 1; return REV; };

const one = async (t, sql, p) => (await t.all(sql, p))[0] || null;

// ---------- texto seguro ----------
// Remove o que permite injetar HTML em páginas de outros usuários.
const safe = (v, max) => U.text(v, max).replace(/[<>"`]/g, '');

// ---------- prazos de bloqueio ----------
const HOLD_DEFAULT = 24; // horas que o proprietário tem para responder uma proposta
const ADV_DEFAULT = 24; // horas, depois do aceite, para o corretor informar o adiantamento
const INT_HOURS = 6; // duração de um "interesse" (não bloqueia ninguém)
const QUEUE_MAX = 3; // propostas na fila para as mesmas datas
const STRIKE_DAYS = 90; // ocorrências valem por 90 dias
const holdH = (h) => Math.min(72, Math.max(6, Number(h && h.hold) || HOLD_DEFAULT));
const advH = (h) => Math.min(168, Math.max(6, Number(h && h.advH) || ADV_DEFAULT));

// ---------- casas ----------
const NUMS = { q: [0, 60], s: [0, 60], b: [0, 60], lot: [1, 200], v: [0, 60], rate: [0, 1e7], minN: [1, 60], minSp: [0, 60], adv: [0, 100], hue: [0, 360], hold: [6, 72], advH: [6, 168] };
const STRS = { name: 120, loc: 160, a: 30, pool: 200, pets: 40, desc: 3000, rules: 4000, cit: 10, cot: 10, acc: 600, wfn: 80, wfp: 80, ph: 600, ci: 3000, co: 3000 };

function cleanHouse(inc, prev) {
  const d = {};
  for (const k of Object.keys(STRS)) d[k] = safe(inc[k], STRS[k]).trim();
  for (const k of Object.keys(NUMS)) { const [lo, hi] = NUMS[k]; d[k] = Math.min(hi, Math.max(lo, U.num(inc[k], lo))); }
  d.hold = inc.hold == null ? (prev && prev.hold) || HOLD_DEFAULT : d.hold;
  d.advH = inc.advH == null ? (prev && prev.advH) || ADV_DEFAULT : d.advH;
  d.adv = inc.adv == null ? (prev && prev.adv != null ? prev.adv : 50) : d.adv;
  d.am = (Array.isArray(inc.am) ? inc.am : []).filter((x) => typeof x === 'string' && /^[a-z0-9]{1,30}$/.test(x)).slice(0, 80);
  const rates = {};
  if (inc.rates && typeof inc.rates === 'object') {
    let n = 0;
    for (const k of Object.keys(inc.rates)) { if (U.isDate(k) && n++ < 1500) rates[k] = Math.min(1e7, Math.max(0, U.num(inc.rates[k], 0))); }
  }
  d.rates = rates;
  // Itens do check-in/check-out que o proprietário NÃO exige (o corretor só repassa os demais).
  d.ckoff = (Array.isArray(inc.ckoff) ? inc.ckoff : (prev && prev.ckoff) || []).filter((x) => typeof x === 'string' && /^(ci|co):[tawi]\d{0,3}$/.test(x)).slice(0, 80);
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
  await t.run('DELETE FROM interests WHERE house_id = ?', [id]);
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

// ---------- preferências de aviso e fila de envio (e-mail e push) ----------
const CHANNELS = ['both', 'email', 'push', 'none'];
async function prefsOf(t, email) {
  const r = await one(t, 'SELECT lang, doc FROM uprefs WHERE email = ?', [email]);
  const d = r ? U.parse(r.doc, {}) : {};
  const ev = {};
  M.GROUPS.forEach((g) => { ev[g] = !(d.ev && d.ev[g] === false); });
  return { lang: M.pickLang(r && r.lang), ch: CHANNELS.includes(d.ch) ? d.ch : 'both', ev };
}
async function setPrefs(t, email, inc) {
  const cur = await prefsOf(t, email);
  const next = { lang: inc.lang !== undefined ? M.pickLang(inc.lang) : cur.lang, ch: CHANNELS.includes(inc.ch) ? inc.ch : cur.ch, ev: Object.assign({}, cur.ev) };
  if (inc.ev && typeof inc.ev === 'object') M.GROUPS.forEach((g) => { if (typeof inc.ev[g] === 'boolean') next.ev[g] = inc.ev[g]; });
  const doc = JSON.stringify({ ch: next.ch, ev: next.ev });
  const r = await t.run('UPDATE uprefs SET lang = ?, doc = ? WHERE email = ?', [next.lang, doc, email]);
  if (!r.changes) await t.run('INSERT INTO uprefs (email, lang, doc) VALUES (?,?,?)', [email, next.lang, doc]);
  return next;
}

// Cria o aviso fora do site (e-mail e/ou push) respeitando canal, tipo de aviso e idioma de quem recebe.
// opt.force: aviso de segurança (ex.: redefinição de senha), sempre por e-mail e sem olhar as preferências.
async function event(t, to, kind, vars, opt = {}) {
  const K = M.KINDS[kind];
  if (!to || !K) return;
  const known = await one(t, 'SELECT email FROM users WHERE email = ?', [to]);
  const p = known ? await prefsOf(t, known.email) : { lang: M.pickLang(vars && vars.lang), ch: 'email', ev: {} };
  if (!opt.force && (p.ch === 'none' || p.ev[K.grp] === false)) return;
  const ch = opt.force ? 'email' : p.ch;
  const msg = M.render(kind, p.lang, vars, cfg.PUBLIC_URL);
  const now = Date.now();
  const put = (channel, doc) => t.run('INSERT INTO outbox (id, to_email, channel, kind, doc, status, attempts, next_at, last_error, created, sent) VALUES (?,?,?,?,?,?,0,?,?,?,0)', [U.rid(8), to, channel, kind, JSON.stringify(doc), 'pending', now, '', now]);
  if ((ch === 'both' || ch === 'email') && cfg.SMTP_HOST) await put('email', { subject: msg.subject, text: msg.text, html: msg.html });
  if ((ch === 'both' || ch === 'push') && !opt.force && known && await one(t, 'SELECT 1 AS x FROM push_subs WHERE email = ?', [to])) {
    await put('push', { title: msg.title, body: msg.body.slice(0, 300), url: msg.url || '/', tag: kind + ':' + U.text(vars && vars.pid, 40) });
  }
}

// ---------- consentimentos (termos e privacidade) ----------
async function consent(t, email, ip, version, kind) {
  await t.run('INSERT INTO consents (id, email, kind, version, at, ip_hash) VALUES (?,?,?,?,?,?)', [U.rid(8), email, kind || 'terms', version, Date.now(), U.sha256(String(ip || ''))]);
}

// ---------- propostas ----------
const isOpen = (s) => s === 'pending' || s === 'countered';
async function saveProposal(t, doc, houseId, broker, owner) {
  const j = JSON.stringify(doc);
  const tok = doc.tok || null;
  const r = await t.run('UPDATE proposals SET status = ?, doc = ?, updated = ?, tok = ? WHERE id = ?', [doc.status, j, Date.now(), tok, doc.id]);
  if (!r.changes) await t.run('INSERT INTO proposals (id, house_id, broker_email, owner_email, status, doc, updated, tok) VALUES (?,?,?,?,?,?,?,?)', [doc.id, houseId, broker, owner, doc.status, j, Date.now(), tok]);
}

// ---------- ocorrências (flag do corretor) ----------
const nightsOf = (d) => U.nightList(d.in, d.out);
const overlaps = (a, b) => { const s = new Set(nightsOf(a)); return nightsOf(b).some((k) => s.has(k)); };

// Registra uma ocorrência (kind: hold = contraproposta sem resposta, advance = adiantamento não informado) e avisa os dois lados.
async function strike(t, doc, kind) {
  await t.run('INSERT INTO strikes (id, broker_email, owner_email, house_id, kind, pid, at) VALUES (?,?,?,?,?,?,?)', [U.rid(8), doc.broker, doc.oe, doc.hid, kind, doc.id, Date.now()]);
  const n = await strikeCount(t, doc.broker);
  await notify(t, doc.oe, 'Ocorrência registrada no perfil de ' + doc.bname + ' (' + n + ')', doc.id);
  await notify(t, doc.broker, 'Você recebeu uma ocorrência (' + n + ' nos últimos ' + STRIKE_DAYS + ' dias). Com 2 ocorrências você só pode ter 1 proposta aberta; com 3 perde o direito de propor.', doc.id);
  return n;
}
const strikeCount = async (t, email) => Number((await one(t, 'SELECT COUNT(*) AS n FROM strikes WHERE broker_email = ? AND at > ?', [email, Date.now() - STRIKE_DAYS * 864e5])).n);
const openLimit = (n) => (n >= 2 ? 1 : 3);

// Flag de cada corretor para o proprietário: total recente, as dele, nível (0 a 3) e a última.
async function flagsFor(t, emails, owner) {
  const out = {};
  const since = Date.now() - STRIKE_DAYS * 864e5;
  for (const e of emails) {
    const rows = await t.all('SELECT owner_email, at FROM strikes WHERE broker_email = ? AND at > ? ORDER BY at DESC', [e, since]);
    if (!rows.length) continue;
    out[e] = { n: rows.length, mine: rows.filter((r) => r.owner_email === owner).length, lv: Math.min(3, rows.length), last: rows[0].at };
  }
  return out;
}

// Oferta na fila maior que a proposta que está com o proprietário: ele é avisado do valor, nunca de quem ofereceu.
// Sem `pid`: o aviso não pode abrir a proposta da fila, que continua invisível para ele.
async function queueHigher(t, ownerEmail, d, value) {
  await notify(t, ownerEmail, 'Oferta maior aguardando para ' + d.house + ': ' + M.fmtMoney(value, 'pt') + ' de ' + d.in + ' a ' + d.out + '. Ela assume o lugar se a proposta atual for recusada ou expirar.');
  await event(t, ownerEmail, 'queue_higher', { house: d.house, in: d.in, out: d.out, value });
}

// Quando as datas ficam livres, a proposta mais antiga da fila vira a proposta ativa (e o proprietário é avisado).
async function promoteQueue(t, houseId) {
  const rows = await t.all("SELECT * FROM proposals WHERE house_id = ? AND status = 'pending' ORDER BY updated", [houseId]);
  const queued = rows.map((r) => ({ r, d: U.parse(r.doc, {}) })).filter((x) => x.d.q).sort((a, b) => (a.d.cr || 0) - (b.d.cr || 0));
  if (!queued.length) return 0;
  const hrow = await one(t, 'SELECT * FROM houses WHERE id = ?', [houseId]);
  if (!hrow) return 0;
  const house = houseDoc(hrow);
  let n = 0;
  for (const { r, d } of queued) {
    const bl = new Set(await readBlocks(t, houseId));
    const live = (await t.all("SELECT doc FROM proposals WHERE house_id = ? AND status IN ('pending','countered','accepted') AND id <> ?", [houseId, r.id])).map((x) => U.parse(x.doc, {})).filter((x) => !x.q);
    if (nightsOf(d).some((k) => bl.has(k)) || live.some((x) => overlaps(x, d))) continue;
    delete d.q;
    d.exp = Date.now() + holdH(house) * 36e5;
    await saveProposal(t, d, houseId, r.broker_email, r.owner_email);
    await notify(t, r.broker_email, 'Sua proposta para ' + d.house + ' saiu da fila e foi enviada ao proprietário', d.id);
    await event(t, r.broker_email, 'proposal_promoted', { house: d.house, in: d.in, out: d.out, pid: d.id });
    await notify(t, r.owner_email, 'Nova proposta de ' + d.bname + ' para ' + d.house, d.id);
    await event(t, r.owner_email, 'proposal_new', { house: d.house, broker: d.bname, in: d.in, out: d.out, value: d.value, hours: holdH(house), pid: d.id });
    n++;
  }
  return n;
}

// Vence prazos: propostas sem resposta, contrapropostas ignoradas (ocorrência), reservas sem adiantamento (liberam as datas + ocorrência) e interesses.
async function expireDue(t) {
  const now = Date.now();
  const rows = await t.all("SELECT * FROM proposals WHERE status IN ('pending','countered','accepted')");
  const touched = new Set();
  let n = 0;
  for (const r of rows) {
    const d = U.parse(r.doc, null);
    if (!d) continue;
    if (r.status === 'accepted') {
      const hrow = d.acc && !d.pay && !d.paid ? await one(t, 'SELECT * FROM houses WHERE id = ?', [r.house_id]) : null;
      if (!hrow || d.acc + advH(houseDoc(hrow)) * 36e5 >= now) continue;
      d.status = 'expired'; d.rel = 'adv';
      d.log = d.log || [];
      d.log.push({ d: U.today(), s: 'expired', v: d.final || d.value });
      await saveProposal(t, d, r.house_id, r.broker_email, r.owner_email);
      const gone = new Set(nightsOf(d));
      await writeBlocks(t, r.house_id, (await readBlocks(t, r.house_id)).filter((k) => !gone.has(k)));
      await notify(t, r.broker_email, 'A reserva de ' + d.house + ' foi liberada: o adiantamento não foi informado a tempo', d.id);
      await notify(t, r.owner_email, 'A reserva de ' + d.bname + ' em ' + d.house + ' foi liberada: adiantamento não informado. As datas voltaram à agenda.', d.id);
      const vars = { house: d.house, in: d.in, out: d.out, pid: d.id };
      await event(t, r.broker_email, 'proposal_released', vars);
      await event(t, r.owner_email, 'proposal_released', vars);
      await strike(t, d, 'advance');
      touched.add(r.house_id); n++;
      continue;
    }
    if (!d.exp || d.exp >= now) continue;
    d.status = 'expired';
    d.log = d.log || [];
    d.log.push({ d: U.today(), s: 'expired', v: d.value });
    await saveProposal(t, d, r.house_id, r.broker_email, r.owner_email);
    await notify(t, r.broker_email, 'A proposta para ' + d.house + ' expirou sem resposta', d.id);
    await notify(t, r.owner_email, 'A proposta de ' + d.bname + ' para ' + d.house + ' expirou', d.id);
    const vars = { house: d.house, in: d.in, out: d.out, pid: d.id };
    await event(t, r.broker_email, 'proposal_expired', vars);
    await event(t, r.owner_email, 'proposal_expired', vars);
    if (r.status === 'countered') await strike(t, d, 'hold');
    touched.add(r.house_id); n++;
  }
  for (const h of touched) await promoteQueue(t, h);
  await t.run('DELETE FROM interests WHERE exp < ?', [now]);
  return n;
}

// Lembrete 6 horas antes de vencer: vai a quem precisa responder (proprietário se pendente, corretor se contraproposta).
const REMIND_MS = 6 * 36e5;
async function remindDue(t) {
  const now = Date.now();
  const rows = await t.all("SELECT * FROM proposals WHERE status IN ('pending','countered')");
  let n = 0;
  for (const r of rows) {
    const d = U.parse(r.doc, null);
    if (!d || !d.exp || d.rem6 || d.exp <= now || d.exp - now > REMIND_MS) continue;
    d.rem6 = 1;
    await t.run('UPDATE proposals SET doc = ? WHERE id = ?', [JSON.stringify(d), r.id]);
    await event(t, r.status === 'countered' ? r.broker_email : r.owner_email, 'proposal_expiring', { house: d.house, in: d.in, out: d.out, hours: Math.max(1, Math.ceil((d.exp - now) / 36e5)), pid: d.id });
    n++;
  }
  for (const r of await t.all("SELECT * FROM proposals WHERE status = 'accepted'")) {
    const d = U.parse(r.doc, null);
    if (!d || !d.acc || d.pay || d.paid || d.rem6a) continue;
    const hrow = await one(t, 'SELECT * FROM houses WHERE id = ?', [r.house_id]);
    const end = d.acc + advH(hrow ? houseDoc(hrow) : null) * 36e5;
    if (!hrow || end <= now || end - now > REMIND_MS) continue;
    d.rem6a = 1;
    await t.run('UPDATE proposals SET doc = ? WHERE id = ?', [JSON.stringify(d), r.id]);
    await event(t, r.broker_email, 'advance_due', { house: d.house, in: d.in, out: d.out, hours: Math.max(1, Math.ceil((end - now) / 36e5)), pid: d.id });
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

module.exports = { HOLD_DEFAULT, ADV_DEFAULT, INT_HOURS, QUEUE_MAX, STRIKE_DAYS, holdH, advH, strike, strikeCount, openLimit, flagsFor, promoteQueue, queueHigher, nightsOf, overlaps, rev, bump, one, safe, cleanHouse, savePhotos, newSlug, houseDoc, deleteHouse, related, notify, consent, prefsOf, setPrefs, event, remindDue, CHANNELS, isOpen, saveProposal, expireDue, readBlocks, writeBlocks, NUMS, STRS };
