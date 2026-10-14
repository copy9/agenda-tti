'use strict';
// Ponto de entrada. Na Hostinger, use este arquivo como "Entry file".
const cfg = require('./src/config');
// A telemetria precisa subir antes dos outros módulos para a instrumentação automática funcionar.
const T = require('./src/telemetry');
T.init();
const db = require('./src/db');
const { migrate } = require('./src/migrate');
const A = require('./src/auth');
const { build } = require('./src/app');

async function main() {
  await migrate();
  const hasAdmin = await A.ensureAdmin();
  if (!hasAdmin) T.log('warn', 'ADMIN_EMAIL e ADMIN_PASSWORD não definidos: o painel de administração ficará desativado.');
  const app = build();
  await app.tick();
  setInterval(() => app.tick(), 60e3).unref();
  setInterval(() => app.drain(), 10e3).unref();
  app.listen(cfg.PORT, () => T.log('info', 'Agenda TTI no ar', { port: cfg.PORT, db: db.dialect }));
  const stop = async () => { try { await T.shutdown(); await db.close(); } catch (e) { /* ignora */ } process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { T.captureException(e, { source: 'boot' }); process.exit(1); });
