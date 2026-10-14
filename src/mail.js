'use strict';
// Envio de e-mail por SMTP, só com módulos nativos (net/tls). Suporta TLS direto, STARTTLS e conexão simples (só para testes locais).
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const cfg = require('./config');
const U = require('./util');

const enabled = () => !!cfg.SMTP_HOST;
const clean = (s) => String(s == null ? '' : s).replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
const addrOf = (s) => { const m = /<([^<>]+)>\s*$/.exec(s); return clean(m ? m[1] : s); };
const b64lines = (buf) => (buf.toString('base64').match(/.{1,76}/g) || ['']).join('\r\n');
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=');

function from() {
  if (cfg.MAIL_FROM) return clean(cfg.MAIL_FROM);
  if (cfg.SMTP_USER && /@/.test(cfg.SMTP_USER)) return 'Agenda TTI <' + clean(cfg.SMTP_USER) + '>';
  return 'Agenda TTI <no-reply@localhost>';
}

// Mensagem MIME multipart/alternative (texto + HTML). Cabeçalhos passam por limpeza para barrar injeção de linhas.
function build({ to, subject, text, html, from: f }) {
  if (!U.isEmail(to)) throw new Error('Destinatário inválido.');
  const fromH = clean(f || from());
  const domain = (addrOf(fromH).split('@')[1] || 'localhost');
  const bound = 'tti_' + crypto.randomBytes(12).toString('hex');
  const head = [
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'From: ' + fromH,
    'To: ' + to,
    'Subject: ' + encWord(clean(subject)),
    'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@' + domain + '>',
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
    'Content-Type: multipart/alternative; boundary="' + bound + '"',
  ].join('\r\n');
  const part = (type, body) => '--' + bound + '\r\nContent-Type: ' + type + '; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64lines(Buffer.from(body, 'utf8')) + '\r\n';
  return head + '\r\n\r\n' + part('text/plain', text || '') + (html ? part('text/html', html) : '') + '--' + bound + '--\r\n';
}

// Leitor de respostas SMTP (linhas "250-..." continuam, "250 ..." encerra).
function reader(sock) {
  let buf = ''; let waiter = null; let err = null;
  const take = () => {
    const lines = buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
        const reply = { code: Number(lines[i].slice(0, 3)), lines: lines.slice(0, i + 1).map((l) => l.slice(4)) };
        buf = lines.slice(i + 1).join('\r\n');
        return reply;
      }
    }
    return null;
  };
  const pump = () => { if (!waiter) return; if (err) { const w = waiter; waiter = null; w.no(err); return; } const r = take(); if (r) { const w = waiter; waiter = null; w.ok(r); } };
  sock.on('data', (d) => { buf += d.toString('utf8'); pump(); });
  sock.on('error', (e) => { err = e; pump(); });
  sock.on('close', () => { err = err || new Error('Conexão SMTP encerrada.'); pump(); });
  return {
    read: () => new Promise((ok, no) => { waiter = { ok, no }; pump(); }),
    stop: () => { sock.removeAllListeners('data'); },
  };
}

async function sendRaw(to, raw) {
  const host = cfg.SMTP_HOST; const port = cfg.SMTP_PORT;
  let sock = await new Promise((ok, no) => {
    const s = cfg.SMTP_SECURITY === 'tls' ? tls.connect({ host, port, servername: host }, () => ok(s)) : net.connect({ host, port }, () => ok(s));
    s.once('error', no);
    s.setTimeout(20000, () => s.destroy(new Error('Tempo esgotado no SMTP.')));
  });
  let rd = reader(sock);
  const expect = (r, ...codes) => { if (!codes.includes(r.code)) throw new Error('SMTP ' + r.code + ' ' + clean(r.lines.join(' ')).slice(0, 200)); return r; };
  const cmd = async (line, ...codes) => { sock.write(line + '\r\n'); return expect(await rd.read(), ...codes); };
  try {
    expect(await rd.read(), 220);
    let ehlo = await cmd('EHLO agenda-tti', 250);
    if (cfg.SMTP_SECURITY === 'starttls') {
      if (!ehlo.lines.some((l) => /^STARTTLS/i.test(l))) throw new Error('O servidor SMTP não oferece STARTTLS.');
      await cmd('STARTTLS', 220);
      rd.stop();
      sock = tls.connect({ socket: sock, servername: host });
      await new Promise((ok, no) => { sock.once('secureConnect', ok); sock.once('error', no); });
      rd = reader(sock);
      ehlo = await cmd('EHLO agenda-tti', 250);
    }
    if (cfg.SMTP_USER) {
      const mech = ehlo.lines.find((l) => /^AUTH\b/i.test(l)) || '';
      if (/\bPLAIN\b/i.test(mech)) await cmd('AUTH PLAIN ' + Buffer.from('\0' + cfg.SMTP_USER + '\0' + cfg.SMTP_PASS).toString('base64'), 235);
      else if (/\bLOGIN\b/i.test(mech)) {
        await cmd('AUTH LOGIN', 334);
        await cmd(Buffer.from(cfg.SMTP_USER).toString('base64'), 334);
        await cmd(Buffer.from(cfg.SMTP_PASS).toString('base64'), 235);
      } else throw new Error('O servidor SMTP não oferece AUTH PLAIN nem LOGIN.');
    }
    await cmd('MAIL FROM:<' + addrOf(from()) + '>', 250);
    await cmd('RCPT TO:<' + to + '>', 250, 251);
    await cmd('DATA', 354);
    sock.write(raw.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..') + '\r\n.\r\n');
    expect(await rd.read(), 250);
    try { sock.write('QUIT\r\n'); } catch (e) { /* já fechou */ }
  } finally { sock.destroy(); }
}

async function send(msg) {
  if (!enabled()) throw new Error('E-mail não configurado (SMTP_HOST).');
  await sendRaw(msg.to, build(msg));
}

module.exports = { enabled, build, send, from };
