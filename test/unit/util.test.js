'use strict';
const test = require('node:test');
const assert = require('node:assert');
const U = require('../../src/util');

test('datas: validação, noites e soma de dias', () => {
  assert.ok(U.isDate('2026-12-31'));
  for (const d of ['2026-13-01', '2026-1-1', 'x', null, 20261231]) assert.ok(!U.isDate(d), String(d));
  assert.deepStrictEqual(U.nightList('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepStrictEqual(U.nightList('2026-12-30', '2026-12-30'), []);
  assert.deepStrictEqual(U.nightList('2026-12-30', '2026-12-01'), []);
  assert.strictEqual(U.addDays('2026-02-28', 1), '2026-03-01');
  assert.strictEqual(U.nightsBetween('2026-01-01', '2026-01-08'), 7);
});

test('e-mail', () => {
  assert.ok(U.isEmail('a@b.co'));
  for (const e of ['a@b', 'a b@c.com', '@x.com', '<a>@b.com', 'a'.repeat(200) + '@b.com']) assert.ok(!U.isEmail(e), e);
});

test('sanitização remove caracteres de HTML', () => {
  assert.strictEqual(U.clean('  <b>"Oi" & \'x\'</b>  '), 'bOi  x/b');
  assert.strictEqual(U.clean('a'.repeat(300), 10).length, 10);
  assert.strictEqual(U.digits('(51) 99999-0001'), '51999990001');
});

test('números e inteiros com limites', () => {
  assert.strictEqual(U.num('abc', 7), 7);
  assert.strictEqual(U.num('3.5'), 3.5);
  assert.strictEqual(U.int('9999', 1, 0, 100), 100);
  assert.strictEqual(U.int('-5', 1, 0, 100), 0);
});

test('parse devolve o padrão quando o JSON é inválido', () => {
  assert.deepStrictEqual(U.parse('{', { a: 1 }), { a: 1 });
  assert.deepStrictEqual(U.parse('[1]', null), [1]);
});

test('mutex executa uma gravação por vez e continua após erro', async () => {
  const lock = U.mutex();
  const order = [];
  const a = lock(async () => { await new Promise((r) => setTimeout(r, 20)); order.push('a'); });
  const b = lock(async () => { order.push('b'); throw new Error('falhou'); });
  const c = lock(async () => { order.push('c'); });
  await a;
  await assert.rejects(b, /falhou/);
  await c;
  assert.deepStrictEqual(order, ['a', 'b', 'c']);
});

test('bad cria erro HTTP com status', () => {
  const e = U.bad('x', 409);
  assert.ok(e instanceof U.HttpError);
  assert.strictEqual(e.status, 409);
});
