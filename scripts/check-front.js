'use strict';
// Confere se o front gerado está em dia com a fonte. Uso: npm run check:front
// `public/index.html` é o app entregue pelo servidor e `index.html` é a demonstração do GitHub Pages.
// Os dois nascem de `front/source.html`; quando alguém edita a fonte e esquece de gerar, a tela publicada
// fica diferente do código revisado — foi o que aconteceu com a demonstração do Pages.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const falhas = [];

// 1. demonstração do Pages: saída de make-pages (npm run pages)
const tmpPg = path.join(os.tmpdir(), 'tti-pages-check-' + process.pid + '.html');
const rp = spawnSync(process.execPath, [path.join(root, 'scripts/make-pages.js'), path.join(root, 'front/source.html'), tmpPg], { encoding: 'utf8' });
if (rp.status !== 0) falhas.push('não foi possível gerar a demonstração para comparar: ' + ((rp.stderr || '').trim() || 'erro desconhecido'));
else {
  if (fs.readFileSync(tmpPg, 'utf8') !== read('index.html')) falhas.push('index.html (demonstração do GitHub Pages) está diferente do que front/source.html gera — rode: npm run pages');
  try { fs.unlinkSync(tmpPg); } catch (e) { /* ok */ }
}

// 2. app do servidor: saída do make-front
const tmp = path.join(os.tmpdir(), 'tti-front-check-' + process.pid + '.html');
const r = spawnSync('python3', [path.join(root, 'scripts/make-front.py'), path.join(root, 'front/source.html'), tmp], { encoding: 'utf8' });
if (r.status !== 0) {
  falhas.push('não foi possível gerar o front para comparar: ' + ((r.stderr || '').trim() || 'python3 indisponível'));
} else {
  if (fs.readFileSync(tmp, 'utf8') !== read('public/index.html')) falhas.push('public/index.html está diferente do que front/source.html gera — rode: npm run build:front');
  try { fs.unlinkSync(tmp); } catch (e) { /* ok */ }
}

if (falhas.length) {
  for (const f of falhas) console.error('front fora de dia: ' + f);
  process.exit(1);
}
console.log('check-front OK (public/index.html e index.html em dia com front/source.html).');
