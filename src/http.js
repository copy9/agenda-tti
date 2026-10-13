'use strict';
// Mini framework HTTP, só com módulos nativos do Node (sem Express).
const http = require('http');
const zlib = require('zlib');
const { HttpError } = require('./util');
const T = require('./telemetry');

function parseCookies(h) {
  const o = {};
  String(h || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) { try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* ignora */ } }
  });
  return o;
}

function createApp() {
  const routes = [];
  const app = {
    add(method, pattern, handler) {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
      routes.push({ method, re, keys, handler, pattern });
    },
    get(p, h) { app.add('GET', p, h); },
    post(p, h) { app.add('POST', p, h); },
    delete(p, h) { app.add('DELETE', p, h); },
    hooks: { before: [], after: [] },
    server: null,
  };

  async function readBody(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, 'Conteúdo grande demais.');
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  function decorate(req, res, url) {
    req.url_ = url;
    req.query = Object.fromEntries(url.searchParams.entries());
    req.cookies = parseCookies(req.headers.cookie);
    req.ip_ = (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
    req.secure_ = req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    res.cookies = [];
    res.setCookie = (name, value, opt = {}) => {
      let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
      if (opt.maxAge != null) c += `; Max-Age=${Math.floor(opt.maxAge)}`;
      if (req.secure_) c += '; Secure';
      res.cookies.push(c);
    };
    res.send = (status, body, headers = {}) => {
      const h = Object.assign({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      }, headers);
      if (req.secure_) h['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
      if (res.cookies.length) h['Set-Cookie'] = res.cookies;
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? '' : body));
      const ct = String(h['Content-Type'] || '');
      const gz = buf.length > 1024 && /gzip/.test(String(req.headers['accept-encoding'] || '')) && /(json|html|text|javascript|css|svg)/.test(ct);
      if (gz) {
        zlib.gzip(buf, (err, z) => {
          if (err) { res.writeHead(status, h); return res.end(buf); }
          h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; h['Content-Length'] = z.length;
          res.writeHead(status, h); res.end(z);
        });
      } else { h['Content-Length'] = buf.length; res.writeHead(status, h); res.end(buf); }
    };
    res.json = (status, obj) => res.send(status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.html = (status, html) => res.send(status, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  }

  async function handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch (e) { res.statusCode = 400; return res.end(); }
    decorate(req, res, url);
    const tctx = T.startRequest(req);
    res.setHeader('X-Request-Id', tctx.id);
    res.on('finish', () => T.finishRequest(tctx, req, res.statusCode));
    try {
      let route = null; let m = null;
      const path = url.pathname;
      for (const r of routes) {
        if (r.method !== req.method) continue;
        m = r.re.exec(path);
        if (m) { route = r; break; }
      }
      if (!route) { return res.json(404, { error: 'Não encontrado.' }); }
      tctx.route = route.pattern;
      req.params = {};
      route.keys.forEach((k, i) => { try { req.params[k] = decodeURIComponent(m[i + 1]); } catch (e) { req.params[k] = m[i + 1]; } });
      if (req.method === 'POST' || req.method === 'DELETE') {
        const ct = String(req.headers['content-type'] || '');
        const raw = await readBody(req, 14 * 1024 * 1024);
        if (raw.length) {
          // Exigir JSON barra formulários enviados de outros sites (CSRF).
          if (!/^application\/json/i.test(ct)) throw new HttpError(415, 'Use application/json.');
          try { req.body = JSON.parse(raw.toString('utf8')); } catch (e) { throw new HttpError(400, 'JSON inválido.'); }
        } else req.body = {};
      }
      for (const f of app.hooks.before) await f(req, res);
      await route.handler(req, res);
    } catch (e) {
      if (res.headersSent) return;
      if (e instanceof HttpError) return res.json(e.status, { error: e.message });
      T.captureException(e, { reqId: tctx.id, route: tctx.route });
      res.json(500, { error: 'Erro interno do servidor.' });
    }
  }

  app.listen = (port, cb) => { app.server = http.createServer(handle); app.server.listen(port, cb); return app.server; };
  app.handle = handle;
  return app;
}
module.exports = { createApp, parseCookies };
