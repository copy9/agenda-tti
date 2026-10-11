'use strict';
// Confere a conexão com o banco e mostra um resumo. Uso: npm run check:db
const db = require('../src/db');
const { migrate } = require('../src/migrate');
(async () => {
  await migrate();
  const n = async (t) => Number((await db.one(`SELECT COUNT(*) AS n FROM ${t}`)).n);
  console.log(`Banco OK (${db.dialect})`);
  for (const t of ['users', 'houses', 'invites', 'proposals', 'photos']) console.log(`  ${t}: ${await n(t)}`);
  await db.close();
})().catch((e) => { console.error('Falha ao conectar no banco:', e.message); process.exit(1); });
