'use strict';
// Aplicativo instalável: manifest, ícones e service worker precisam chegar ao celular. Issue #10.
const { test, assert, Client } = require('./helpers');

test('o manifest descreve o aplicativo e aponta para ícones que existem', async () => {
  const r = await new Client().get('/app/manifest.webmanifest');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /application\/manifest\+json/);
  const m = JSON.parse(r.txt);
  assert.equal(m.name, 'Agenda TTI');
  assert.equal(m.start_url, '/');
  assert.equal(m.display, 'standalone', 'sem isso o iPhone abre dentro do Safari, não como aplicativo');
  assert.ok(m.theme_color && m.background_color);
  assert.ok(m.icons.some((i) => i.sizes === '192x192'), 'o Android precisa do 192');
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'sem o maskable o ícone sai cortado no Android');
  for (const i of m.icons) {
    const ic = await new Client().get(i.src);
    assert.equal(ic.status, 200, 'ícone ausente: ' + i.src);
    assert.match(ic.headers.get('content-type') || '', /image\/png/);
  }
});

test('o iPhone encontra o ícone e o service worker vale para o site todo', async () => {
  const a = await new Client().get('/apple-touch-icon.png');
  assert.equal(a.status, 200);
  assert.match(a.headers.get('content-type') || '', /image\/png/);
  const sw = await new Client().get('/sw.js');
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get('service-worker-allowed'), '/');
  assert.match(sw.headers.get('cache-control') || '', /no-cache/, 'service worker velho preso em cache trava o aplicativo numa versão antiga');
  assert.match(sw.txt, /addEventListener\('push'/, 'os avisos push continuam de pé');
  assert.ok(!/\/api\//.test(sw.txt.split('startsWith')[0] || ''), 'o service worker não pode servir dados de cache');
  assert.match(sw.txt, /pathname\.startsWith\('\/api\/'\)/, 'as chamadas de dados ficam fora do cache');
});

test('nome de arquivo inventado em /app não vaza nada do servidor', async () => {
  for (const p of ['/app/../../src/config.js', '/app/.env', '/app/qualquer.png']) {
    const r = await new Client().get(p);
    assert.ok(r.status === 404 || r.status === 400, p + ' devolveu ' + r.status);
  }
});

test('o app construído aponta para o manifest, e a demonstração do Pages não', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').slice(0, 4000);
  assert.match(app, /<link rel="manifest" href="\/app\/manifest\.webmanifest">/);
  assert.match(app, /rel="apple-touch-icon" href="\/app\/apple-touch-icon\.png"/);
  assert.match(app, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(app, /name="apple-mobile-web-app-title" content="Agenda TTI"/);
  // a demonstração do GitHub Pages não é servida por este servidor e não tem /app/: apontar para lá daria 404
  const demo = fs.readFileSync(path.join(root, 'index.html'), 'utf8').slice(0, 4000);
  assert.ok(!/manifest\.webmanifest/.test(demo), 'a demonstração não pode apontar para o manifest');
});
