'use strict';
// Valida a primeira linha da mensagem de commit (Conventional Commits). Sem dependências.
// Uso: node scripts/check-commit-msg.js <arquivo-da-mensagem>   ou   echo "msg" | node scripts/check-commit-msg.js -
const fs = require('fs');

const TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'build', 'ci', 'style', 'revert'];
const RE = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9._/-]+\\))?!?: \\S.*$`);

function check(msg) {
  const first = String(msg).split(/\r?\n/)[0].trim();
  if (/^(Merge|Revert|fixup!|squash!)/.test(first)) return null;
  if (!RE.test(first)) return `Mensagem fora do padrão: "${first}". Use "tipo(escopo): resumo", com tipo em ${TYPES.join(', ')}.`;
  if (first.length > 100) return 'A primeira linha passa de 100 caracteres.';
  return null;
}

if (require.main === module) {
  const src = process.argv[2];
  const msg = src === '-' || !src ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  const err = check(msg);
  if (err) { console.error(err); process.exit(1); }
}
module.exports = { check, TYPES };
