'use strict';
process.env.SQLITE_FILE = ':memory:';
process.env.DB_DRIVER = 'sqlite';
process.env.LOG_LEVEL = 'error';
process.env.METRICS_TOKEN = 'tok-metricas';
process.env.APP_FILE = require('path').join(__dirname, 'index.fixture2.html');
require('fs').writeFileSync(process.env.APP_FILE, '<html><body><script>window.TTI_BOOT=null;</script></body></html>');

const test = require('node:test');
const assert = require('node:assert');
const db = require('../src/db');
const { migrate } = require('../src/migrate');
const { build } = require('../src/app');

let base; let app;
test.before(async () => {
  await migrate();
  app = build();
  await new Promise((ok) => { app.listen(0, ok); });
  base = 'http://127.0.0.1:' + app.server.address().port;
});
test.after(async () => { app.server.close(); await db.close(); try { require('fs').unlinkSync(process.env.APP_FILE); } catch (e) { /* ok */ } });

const post = (p, body, ip) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || '10.9.9.9' }, body: JSON.stringify(body) });

test('toda resposta traz X-Request-Id', async () => {
  const r = await fetch(base + '/api/health');
  assert.match(r.headers.get('x-request-id'), /^[0-9a-f]{16}$/);
  const r2 = await fetch(base + '/api/health', { headers: { 'x-request-id': 'meu-id-12345678' } });
  assert.strictEqual(r2.headers.get('x-request-id'), 'meu-id-12345678');
});

test('/metrics exige token e expõe métricas da aplicação', async () => {
  assert.strictEqual((await fetch(base + '/metrics')).status, 401);
  assert.strictEqual((await fetch(base + '/metrics', { headers: { authorization: 'Bearer x' } })).status, 401);
  await fetch(base + '/api/health');
  await fetch(base + '/nao-existe');
  const r = await fetch(base + '/metrics', { headers: { authorization: 'Bearer tok-metricas' } });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/plain/);
  const t = await r.text();
  assert.match(t, /tti_http_requests_total\{method="GET",route="\/api\/health",status="200"\} \d+/);
  assert.match(t, /route="unmatched",status="404"/);
  assert.match(t, /tti_http_request_duration_seconds_bucket/);
});

test('erro do navegador e vitals são aceitos e contados', async () => {
  assert.strictEqual((await post('/api/telemetry/error', { message: 'x quebrou', stack: 'at y' })).status, 204);
  assert.strictEqual((await post('/api/telemetry/vitals', { name: 'LCP', value: 1500 })).status, 204);
  const t = await (await fetch(base + '/metrics', { headers: { authorization: 'Bearer tok-metricas' } })).text();
  assert.match(t, /tti_errors_total\{source="browser"\} 1/);
  assert.match(t, /tti_web_vital_count\{name="LCP"\} 1/);
});

test('telemetria do navegador tem limite por IP', async () => {
  let last = 0;
  for (let i = 0; i < 32; i++) last = (await post('/api/telemetry/error', { message: 'm' + i }, '10.7.7.7')).status;
  assert.strictEqual(last, 429);
});

test('formulário de outro site (não JSON) é recusado', async () => {
  const r = await fetch(base + '/api/telemetry/error', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'message=x' });
  assert.strictEqual(r.status, 415);
});
