'use strict';
process.env.LOG_LEVEL = 'debug';
process.env.METRICS_TOKEN = 'token-de-teste';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../../src/telemetry');

function capture(fn) {
  const lines = [];
  const restore = T.setSink((l) => lines.push(JSON.parse(l)));
  try { fn(); } finally { restore(); }
  return lines;
}

test('logs são JSON e escondem dados pessoais', () => {
  const [l] = capture(() => T.log('info', 'login de maria.silva@exemplo.com', {
    password: 'senha123', token: 'abc', email: 'x@y.com', wa: '51999990001', user: 'owner',
    nested: { cookie: 'tti_sid=1', ok: 1, texto: 'fale com joao@x.com.br' },
  }));
  assert.strictEqual(l.level, 'info');
  assert.ok(!JSON.stringify(l).includes('senha123'));
  assert.ok(!JSON.stringify(l).includes('maria.silva@'));
  assert.ok(!JSON.stringify(l).includes('joao@'));
  assert.strictEqual(l.password, '[removido]');
  assert.strictEqual(l.email, '[removido]');
  assert.strictEqual(l.nested.cookie, '[removido]');
  assert.strictEqual(l.nested.ok, 1);
  assert.match(l.msg, /m\*\*\*@exemplo\.com/);
  assert.strictEqual(l.user, 'owner');
});

test('scrub limita profundidade, listas e tamanho', () => {
  const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
  assert.ok(JSON.stringify(T.scrub(deep)).includes('[fundo]'));
  assert.strictEqual(T.scrub(Array.from({ length: 100 }, (_, i) => i)).length, 20);
  assert.strictEqual(T.scrub('x'.repeat(5000)).length, 2000);
});

test('métricas: contador, histograma e gauges no formato Prometheus', () => {
  T.resetMetrics();
  T.inc('tti_teste_total', { rota: '/a"b' }, 2, 'Teste');
  T.observe('tti_teste_seconds', { m: 'GET' }, 0.03, [0.01, 0.05, 0.1], 'Duração');
  T.observe('tti_teste_seconds', { m: 'GET' }, 0.2, [0.01, 0.05, 0.1], 'Duração');
  const out = T.renderMetrics();
  assert.match(out, /# TYPE tti_teste_total counter/);
  assert.match(out, /tti_teste_total\{rota="\/a\\"b"\} 2/);
  assert.match(out, /tti_teste_seconds_bucket\{m="GET",le="0.05"\} 1/);
  assert.match(out, /tti_teste_seconds_bucket\{m="GET",le="\+Inf"\} 2/);
  assert.match(out, /tti_teste_seconds_count\{m="GET"\} 2/);
  assert.match(out, /tti_process_resident_memory_bytes \d+/);
  assert.match(out, /tti_eventloop_lag_p99_seconds /);
});

test('requisição: id aproveitado ou gerado e métricas por rota (sem alta cardinalidade)', () => {
  T.resetMetrics();
  const req = { headers: { 'x-request-id': 'abcdef1234567890' }, method: 'GET', user: null };
  const ctx = T.startRequest(req);
  assert.strictEqual(ctx.id, 'abcdef1234567890');
  assert.match(T.startRequest({ headers: { 'x-request-id': '<script>' } }).id, /^[0-9a-f]{16}$/);
  ctx.route = '/api/invites/:token';
  const lines = capture(() => T.finishRequest(ctx, req, 404));
  assert.strictEqual(lines[0].level, 'warn');
  assert.strictEqual(lines[0].route, '/api/invites/:token');
  assert.match(T.renderMetrics(), /tti_http_requests_total\{method="GET",route="\/api\/invites\/:token",status="404"\} 1/);
});

test('health check não polui o log', () => {
  const ctx = T.startRequest({ headers: {} });
  ctx.route = '/api/health';
  assert.strictEqual(capture(() => T.finishRequest(ctx, { method: 'GET' }, 200)).length, 0);
});

test('erro do navegador: limpo, cortado e contado', () => {
  T.resetMetrics();
  const lines = capture(() => {
    assert.ok(T.captureBrowserError({ message: 'Falhou para ana@x.com\nlinha 2', stack: 'at f (app.js:1:1)'.repeat(500) }));
    assert.ok(!T.captureBrowserError({ message: '   ' }));
    assert.ok(!T.captureBrowserError(null));
  });
  assert.strictEqual(lines.length, 1);
  assert.ok(!JSON.stringify(lines[0]).includes('ana@x.com'));
  assert.strictEqual(lines[0].source, 'browser');
  assert.match(T.renderMetrics(), /tti_errors_total\{source="browser"\} 1/);
});

test('Web Vitals: só nomes conhecidos e valores sãos', () => {
  T.resetMetrics();
  assert.ok(T.recordVital({ name: 'LCP', value: 1800 }));
  assert.ok(T.recordVital({ name: 'CLS', value: 0.04 }));
  for (const b of [{ name: 'XYZ', value: 1 }, { name: 'LCP', value: -1 }, { name: 'LCP', value: 'a' }, { name: 'LCP', value: 1e9 }, null]) assert.ok(!T.recordVital(b));
  assert.match(T.renderMetrics(), /tti_web_vital_count\{name="LCP"\} 1/);
});

test('/metrics: só com o token certo', () => {
  assert.ok(T.metricsAllowed({ headers: { authorization: 'Bearer token-de-teste' } }));
  for (const a of ['Bearer errado', '', undefined, 'token-de-teste-x']) assert.ok(!T.metricsAllowed({ headers: { authorization: a } }));
});

test('init sem DSN nem OTLP não carrega SDK e não quebra', () => {
  const s = T.init();
  assert.deepStrictEqual([s.sentry, s.otel], [false, false]);
});
