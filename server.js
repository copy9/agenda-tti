'use strict';
// Ponto de entrada. Na Hostinger, use este arquivo como "Entry file".
const cfg = require('./src/config');
const db = require('./src/db');
const { migrate } = require('./src/migrate');
const A = require('./src/auth');
const { build } = require('./src/app');

async function main() {
  await migrate();
  const hasAdmin = await A.ensureAdmin();
  if (!hasAdmin) console.warn('[aviso] ADMIN_EMAIL e ADMIN_PASSWORD não definidos: o painel de administração ficará desativado.');
  const app = build();
  await app.tick();
  setInterval(() => app.tick(), 60e3).unref();
  app.listen(cfg.PORT, () => console.log(`Agenda TTI no ar na porta ${cfg.PORT} (banco: ${db.dialect})`));
  const stop = async () => { try { await db.close(); } catch (e) { /* ignora */ } process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { console.error('Falha ao iniciar:', e); process.exit(1); });
