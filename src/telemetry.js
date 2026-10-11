'use strict';
// Observabilidade: logs JSON, métricas Prometheus, captura de erros (Sentry) e traces (OpenTelemetry).
// Tudo é opcional: sem variáveis de ambiente (ou sem os SDKs instalados) vira apenas log e métrica locais.
const crypto = require('crypto');
const { monitorEventLoopDelay } = require('perf_hooks');
const cfg = require('./config');
const U = require('./util');

// ---------- logs ----------
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT = /^(pass|password|senha|token|cookie|authorization|set-cookie|email|e-mail|wa|whatsapp|text|msg|t|guest|body)$/i;
const EMAIL_IN_TEXT = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

const maskEmails = (s) => String(s).replace(EMAIL_IN_TEXT, '$1***@$2');

// Remove dados pessoais antes de registrar. Chaves sensíveis viram "[removido]" e e-mails em textos são mascarados.
function scrub(v, depth = 0) {
  if (v == null) return v;
  if (typeof v === 'string') return maskEmails(v).slice(0, 2000);
  if (typeof v !== 'object') return v;
  if (depth > 4) return '[fundo]';
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => scrub(x, depth + 1));
  const o = {};
  for (const k of Object.keys(v).slice(0, 40)) o[k] = REDACT.test(k) ? '[removido]' : scrub(v[k], depth + 1);
  return o;
}

let sink = (line) => process.stdout.write(line + '\n');
const setSink = (fn) => { const old = sink; sink = fn; return () => { sink = old; }; };

function log(level, msg, fields) {
  if ((LEVELS[level] || 20) < (LEVELS[cfg.LOG_LEVEL] || 20)) return;
  const rec = Object.assign({ t: new Date().toISOString(), level, msg: maskEmails(msg), service: cfg.SERVICE_NAME }, scrub(fields || {}));
  sink(JSON.stringify(rec));
}

// ---------- métricas ----------
const counters = new Map();
const gauges = new Map();
const hists = new Map();
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const VITAL_BUCKETS = { CLS: [0.01, 0.05, 0.1, 0.25, 0.5, 1], default: [100, 250, 500, 1000, 2000, 2500, 4000, 8000] };
const META = new Map();

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const key = (name, labels) => name + '{' + Object.keys(labels || {}).sort().map((k) => `${k}="${esc(labels[k])}"`).join(',') + '}';
const describe = (name, help, type) => { if (!META.has(name)) META.set(name, { help, type }); };

function inc(name, labels, by = 1, help = name) {
  describe(name, help, 'counter');
  const k = key(name, labels);
  counters.set(k, (counters.get(k) || 0) + by);
}
function gauge(name, value, help = name) { describe(name, help, 'gauge'); gauges.set(name, value); }
function observe(name, labels, value, buckets = BUCKETS, help = name) {
  describe(name, help, 'histogram');
  const k = key(name, labels);
  let h = hists.get(k);
  if (!h) { h = { name, labels: labels || {}, buckets, counts: buckets.map(() => 0), sum: 0, n: 0 }; hists.set(k, h); }
  buckets.forEach((b, i) => { if (value <= b) h.counts[i]++; });
  h.sum += value; h.n++;
}

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

function renderMetrics() {
  const m = process.memoryUsage();
  gauge('tti_process_resident_memory_bytes', m.rss, 'Memória residente');
  gauge('tti_process_heap_used_bytes', m.heapUsed, 'Heap usado');
  gauge('tti_process_uptime_seconds', Math.round(process.uptime()), 'Tempo no ar');
  gauge('tti_eventloop_lag_p99_seconds', Number.isFinite(loop.percentile(99)) ? loop.percentile(99) / 1e9 : 0, 'Atraso do event loop (p99)');
  const out = [];
  const head = (name) => { const mt = META.get(name); if (mt) { out.push(`# HELP ${name} ${mt.help}`); out.push(`# TYPE ${name} ${mt.type}`); } };
  const seen = new Set();
  for (const [k, v] of counters) { const n = k.slice(0, k.indexOf('{')); if (!seen.has(n)) { seen.add(n); head(n); } out.push(`${k} ${v}`); }
  for (const [n, v] of gauges) { head(n); out.push(`${n} ${v}`); }
  const hs = new Set();
  for (const h of hists.values()) {
    if (!hs.has(h.name)) { hs.add(h.name); head(h.name); }
    const lab = (extra) => '{' + Object.entries(Object.assign({}, h.labels, extra)).map(([a, b]) => `${a}="${esc(b)}"`).join(',') + '}';
    h.buckets.forEach((b, i) => out.push(`${h.name}_bucket${lab({ le: b })} ${h.counts[i]}`));
    out.push(`${h.name}_bucket${lab({ le: '+Inf' })} ${h.n}`);
    out.push(`${h.name}_sum${lab({})} ${h.sum}`);
    out.push(`${h.name}_count${lab({})} ${h.n}`);
  }
  return out.join('\n') + '\n';
}
function resetMetrics() { counters.clear(); gauges.clear(); hists.clear(); }

// ---------- requisições ----------
function startRequest(req) {
  const inc_ = String(req.headers['x-request-id'] || '');
  const id = /^[\w.-]{8,64}$/.test(inc_) ? inc_ : crypto.randomBytes(8).toString('hex');
  return { id, t0: process.hrtime.bigint(), route: 'unmatched' };
}
function finishRequest(ctx, req, status) {
  const sec = Number(process.hrtime.bigint() - ctx.t0) / 1e9;
  const labels = { method: req.method, route: ctx.route, status: String(status) };
  inc('tti_http_requests_total', labels, 1, 'Requisições HTTP');
  observe('tti_http_request_duration_seconds', { method: req.method, route: ctx.route }, sec, BUCKETS, 'Duração das requisições HTTP');
  if (ctx.route === '/api/health' && status === 200) return;
  log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'http', { reqId: ctx.id, method: req.method, route: ctx.route, status, ms: Math.round(sec * 1000), user: req.user ? req.user.role : 'anon' });
}

// ---------- erros ----------
let sentry = null;
function captureException(err, ctx = {}) {
  inc('tti_errors_total', { source: ctx.source || 'server' }, 1, 'Erros capturados');
  log('error', (err && err.message) || 'erro', { reqId: ctx.reqId, route: ctx.route, source: ctx.source || 'server', stack: err && err.stack ? String(err.stack).split('\n').slice(0, 8).join('\n') : undefined });
  if (sentry) {
    try { sentry.withScope((s) => { s.setTag('source', ctx.source || 'server'); if (ctx.reqId) s.setTag('reqId', ctx.reqId); if (ctx.route) s.setTag('route', ctx.route); sentry.captureException(err); }); } catch (e) { /* telemetria nunca derruba o app */ }
  }
}

// Erro enviado pelo navegador (POST /api/telemetry/error). Tudo é cortado e limpo.
function captureBrowserError(b) {
  const o = b && typeof b === 'object' ? b : {};
  const msg = maskEmails(U.text(o.message, 300)).replace(/[\r\n]+/g, ' ');
  if (!msg.trim()) return false;
  const err = new Error(msg);
  err.name = 'BrowserError';
  err.stack = maskEmails(U.text(o.stack, 2500));
  captureException(err, { source: 'browser' });
  return true;
}

const VITALS = new Set(['LCP', 'CLS', 'INP', 'FCP', 'TTFB']);
function recordVital(b) {
  const o = b && typeof b === 'object' ? b : {};
  const name = String(o.name || '');
  const v = Number(o.value);
  if (!VITALS.has(name) || !Number.isFinite(v) || v < 0 || v > 1e6) return false;
  observe('tti_web_vital', { name }, v, VITAL_BUCKETS[name] || VITAL_BUCKETS.default, 'Web Vitals reportados pelo navegador (ms; CLS sem unidade)');
  return true;
}

// ---------- métricas protegidas ----------
function metricsAllowed(req) {
  if (!cfg.METRICS_TOKEN) return false;
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(cfg.METRICS_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- SDKs opcionais ----------
// Chame antes de carregar o resto do app, para a instrumentação automática enxergar http e banco.
let otel = null;
function init() {
  const state = { sentry: false, otel: false, notes: [] };
  if (cfg.SENTRY_DSN) {
    try {
      const S = require('@sentry/node');
      S.init({ dsn: cfg.SENTRY_DSN, environment: cfg.SENTRY_ENV, release: cfg.RELEASE || undefined, sendDefaultPii: false, tracesSampleRate: cfg.TRACES_SAMPLE_RATE });
      sentry = S; state.sentry = true;
    } catch (e) { state.notes.push('SENTRY_DSN definido, mas @sentry/node não está instalado (npm i @sentry/node).'); }
  }
  if (cfg.OTEL_ENABLED) {
    try {
      const { NodeSDK } = require('@opentelemetry/sdk-node');
      const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
      process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || cfg.SERVICE_NAME;
      otel = new NodeSDK({ instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })] });
      otel.start(); state.otel = true;
    } catch (e) { state.notes.push('OTEL_EXPORTER_OTLP_ENDPOINT definido, mas os pacotes OpenTelemetry não estão instalados (veja README, seção Observabilidade).'); }
  }
  state.notes.forEach((n) => log('warn', n));
  log('info', 'telemetria', { sentry: state.sentry, otel: state.otel, metrics: !!cfg.METRICS_TOKEN });
  return state;
}
async function shutdown() {
  try { if (sentry) await sentry.close(2000); } catch (e) { /* ignora */ }
  try { if (otel) await otel.shutdown(); } catch (e) { /* ignora */ }
}

module.exports = { init, shutdown, log, scrub, maskEmails, setSink, inc, observe, gauge, renderMetrics, resetMetrics, startRequest, finishRequest, captureException, captureBrowserError, recordVital, metricsAllowed };
