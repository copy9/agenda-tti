'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { check } = require('../../scripts/check-commit-msg');

test('aceita Conventional Commits', () => {
  for (const m of ['feat: x ok', 'fix(policy): barra data aceita', 'chore!: remove api antiga', 'docs(readme): ajusta']) assert.strictEqual(check(m), null, m);
});
test('recusa mensagens fora do padrão', () => {
  for (const m of ['bagunça', 'Feat: x', 'feat:sem espaço', 'feat(UI): maiúscula', 'wip']) assert.ok(check(m), m);
});
test('ignora merge, revert e fixup', () => {
  for (const m of ['Merge branch x', 'Revert "feat: a"', 'fixup! feat: a']) assert.strictEqual(check(m), null);
});
test('limita a primeira linha', () => {
  assert.ok(check('feat: ' + 'a'.repeat(100)));
});
