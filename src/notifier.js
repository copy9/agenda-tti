'use strict';
// Fila de envio (outbox): e-mail e push com tentativas, espera crescente e registro de falha.
const cfg = require('./config');
const db = require('./db');
const U = require('./util');
const mail = require('./mail');
const push = require('./push');
const T = require('./telemetry');

const BACKOFF = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 6 * 3600e3]; // espera antes de cada nova tentativa
const KEEP_MS = 30 * 864e5;
let draining = false;

async function deliver(row, doc) {
  if (row.channel === 'email') {
    if (!mail.enabled()) throw new Error('E-mail não configurado (SMTP_HOST).');
    await mail.send({ to: row.to_email, subject: doc.subject, text: doc.text, html: doc.html });
    return;
  }
  const subs = await push.subsOf(row.to_email);
  let ok = 0; let lastErr = null;
  for (const s of subs) {
    try {
      const r = await push.send(s, { title: doc.title, body: doc.body, url: doc.url, tag: doc.tag });
      if (r === 'gone') await db.write((t) => t.run('DELETE FROM push_subs WHERE id = ?', [s.id]));
      else ok++;
    } catch (e) { lastErr = e; }
  }
  if (subs.length && !ok && lastErr) throw lastErr;
}

// Envia o que está vencido na fila. Chamado pelo relógio do servidor (a cada poucos segundos).
async function drain(limit = 25) {
  if (draining) return 0;
  draining = true;
  let n = 0;
  try {
    const rows = await db.all("SELECT * FROM outbox WHERE status = 'pending' AND next_at <= ? ORDER BY created LIMIT ?", [Date.now(), limit]);
    for (const r of rows) {
      const doc = U.parse(r.doc, {});
      const now = Date.now();
      try {
        await deliver(r, doc);
        await db.run("UPDATE outbox SET status = 'sent', attempts = ?, sent = ?, last_error = '' WHERE id = ?", [r.attempts + 1, now, r.id]);
        T.inc('tti_outbox_total', { channel: r.channel, result: 'sent' }, 1, 'Avisos enviados e falhos por canal');
        n++;
      } catch (e) {
        const attempts = r.attempts + 1;
        const final = attempts >= cfg.OUTBOX_MAX_ATTEMPTS;
        const msg = T.maskEmails(String(e && e.message || e)).slice(0, 300);
        await db.run('UPDATE outbox SET status = ?, attempts = ?, next_at = ?, last_error = ? WHERE id = ?', [final ? 'failed' : 'pending', attempts, now + BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)], msg, r.id]);
        T.inc('tti_outbox_total', { channel: r.channel, result: final ? 'failed' : 'retry' });
        T.log(final ? 'error' : 'warn', final ? 'aviso não entregue' : 'falha ao enviar aviso, nova tentativa agendada', { channel: r.channel, kind: r.kind, attempts, error: msg });
      }
    }
    return n;
  } finally { draining = false; }
}

// Apaga da fila o que já foi resolvido há mais de 30 dias.
async function purge() {
  const r = await db.run("DELETE FROM outbox WHERE status <> 'pending' AND created < ?", [Date.now() - KEEP_MS]);
  return r.changes;
}

module.exports = { drain, purge };
