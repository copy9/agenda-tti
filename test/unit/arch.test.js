'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const arch = require('../../scripts/arch-contract');

function tmpSrc(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'));
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(d, n), c);
  return d;
}

test('o projeto atual respeita o contrato', () => {
  assert.deepStrictEqual(arch.run(), []);
});

test('util não pode importar camadas do app', () => {
  const d = tmpSrc({ 'util.js': "require('./db');" , 'db.js': '' });
  const p = arch.checkSrc(d);
  assert.ok(p.some((x) => x.includes('util.js') && x.includes('./db')), p.join('\n'));
});

test('views não pode importar app', () => {
  const d = tmpSrc({ 'views.js': "require('./app');" });
  assert.ok(arch.checkSrc(d).some((x) => x.includes('views.js') && x.includes('./app')));
});

test('só db carrega mysql2 e node:sqlite', () => {
  const d = tmpSrc({ 'store.js': "require('mysql2/promise'); require('node:sqlite');" });
  const p = arch.checkSrc(d);
  assert.strictEqual(p.filter((x) => x.includes('store.js')).length, 2, p.join('\n'));
  const ok = tmpSrc({ 'db.js': "require('mysql2/promise'); require('node:sqlite'); require('./config');" });
  assert.deepStrictEqual(arch.checkSrc(ok), []);
});

test('módulo novo sem regra é recusado', () => {
  const d = tmpSrc({ 'novo.js': '' });
  assert.ok(arch.checkSrc(d)[0].includes('sem regra'));
});

test('front não pode ter eval nem script externo', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fr-')), 'a.html');
  fs.writeFileSync(f, '<script>eval("1")</script><script src="https://x.com/a.js"></script>');
  assert.strictEqual(arch.checkFront(f).length, 2);
  fs.writeFileSync(f, '<script>var a=1</script>');
  assert.deepStrictEqual(arch.checkFront(f), []);
});
