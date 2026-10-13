'use strict';
// Contrato de arquitetura (AGENTS.md §6). Sem dependências.
// Uso: node scripts/arch-contract.js            -> verifica o projeto, sai com 1 se houver violação
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LAYERS = ['util', 'config', 'http', 'db', 'migrate', 'store', 'policy', 'views', 'admin', 'auth', 'legal-texts', 'legal', 'telemetry', 'app'];

// Cada regra: o módulo `from` só pode importar (dentro de src/) os módulos listados em `allow`.
// Módulos nativos do Node e pacotes externos são tratados à parte (EXTERNAL).
const ALLOW = {
  util: [],
  config: [],
  http: ['util', 'telemetry'],
  telemetry: ['config', 'util'],
  db: ['config', 'util'],
  migrate: ['db'],
  store: ['config', 'db', 'util'],
  auth: ['config', 'db', 'util', 'store'],
  policy: ['config', 'util', 'store'],
  views: ['db', 'util', 'store'],
  admin: ['db', 'util', 'store'],
  'legal-texts': [],
  legal: ['config', 'db', 'util', 'store', 'admin', 'views', 'legal-texts'],
  app: ['config', 'db', 'util', 'store', 'auth', 'views', 'policy', 'admin', 'legal', 'http', 'telemetry'],
};
// Só estes módulos podem carregar estes pacotes.
const EXTERNAL = { 'node:sqlite': ['db'], 'mysql2/promise': ['db'], mysql2: ['db'] };
const FRONT_BANNED = [/\beval\s*\(/, /new\s+Function\s*\(/, /<script[^>]+src=["']https?:/i];

function requires(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

function checkSrc(dir = path.join(ROOT, 'src')) {
  const problems = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const name = f.replace(/\.js$/, '');
    if (!ALLOW[name]) { problems.push(`src/${f}: módulo sem regra no arch-contract. Adicione-o em ALLOW (e em AGENTS.md §6).`); continue; }
    for (const r of requires(path.join(dir, f))) {
      if (r.startsWith('.')) {
        const dep = path.basename(r).replace(/\.js$/, '');
        if (!ALLOW[name].includes(dep)) problems.push(`src/${f} não pode importar ./${dep} (permitido: ${ALLOW[name].join(', ') || 'nada'}).`);
      } else if (EXTERNAL[r] && !EXTERNAL[r].includes(name)) {
        problems.push(`src/${f} não pode carregar "${r}"; só ${EXTERNAL[r].join(', ')}.`);
      }
    }
  }
  return problems;
}

function checkFront(file) {
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, 'utf8');
  return FRONT_BANNED.filter((re) => re.test(src)).map((re) => `${path.relative(ROOT, file)}: padrão proibido ${re}.`);
}

function checkEntry() {
  const problems = [];
  for (const r of requires(path.join(ROOT, 'server.js'))) {
    if (r === 'mysql2' || r === 'node:sqlite') problems.push(`server.js não pode carregar "${r}" diretamente.`);
  }
  return problems;
}

function run() {
  return [...checkSrc(), ...checkEntry(), ...checkFront(path.join(ROOT, 'front/source.html'))];
}

if (require.main === module) {
  const problems = run();
  if (problems.length) { console.error('Violações do arch-contract:\n- ' + problems.join('\n- ')); process.exit(1); }
  console.log(`arch-contract OK (${LAYERS.length} camadas).`);
}
module.exports = { run, checkSrc, checkFront, requires, ALLOW };
