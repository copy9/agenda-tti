'use strict';
const test = require('node:test');
const assert = require('node:assert');
const A = require('../../src/auth');

test('senha: hash é salgado e a conferência funciona', async () => {
  const h1 = await A.hashPass('segredo123');
  const h2 = await A.hashPass('segredo123');
  assert.notStrictEqual(h1, h2);
  assert.ok(h1.startsWith('s1$'));
  assert.ok(await A.checkPass('segredo123', h1));
  assert.ok(!(await A.checkPass('errada', h1)));
});

test('senha: formato inválido nunca confere', async () => {
  for (const s of ['', 'abc', 's1$00$00', 'x$1$2', null]) assert.ok(!(await A.checkPass('x', s)), String(s));
});

test('limite de tentativas bloqueia a partir do máximo e libera a chave', () => {
  const k = 'teste:' + Math.random();
  for (let i = 0; i < 3; i++) A.limit(k, 3, 60e3);
  assert.throws(() => A.limit(k, 3, 60e3), (e) => e.status === 429);
});
