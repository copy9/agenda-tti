'use strict';
// Gera o index.html da raiz, que é a demonstração publicada no GitHub Pages.
// Era uma cópia literal de front/source.html; agora a cópia também recebe as marcas que
// fazem a demonstração ser instalável no celular. Os caminhos são RELATIVOS porque o Pages
// publica o projeto em /<repositório>/, e caminho absoluto apontaria para fora dele.
// Uso: node scripts/make-pages.js front/source.html index.html
const fs = require('node:fs');

const [, , src, dst] = process.argv;
if (!src || !dst) { console.error('uso: make-pages.js <origem> <destino>'); process.exit(1); }

const HEAD = '<link rel="manifest" href="demo.webmanifest">'
  + '<link rel="apple-touch-icon" href="public/app/apple-touch-icon.png">'
  + '<meta name="apple-mobile-web-app-capable" content="yes">'
  + '<meta name="mobile-web-app-capable" content="yes">'
  + '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
  + '<meta name="apple-mobile-web-app-title" content="Agenda TTI">';
// Registrar falha em file:// e em navegador sem suporte; nunca pode derrubar a página.
const REG = '<script>if("serviceWorker" in navigator&&location.protocol==="https:")'
  + 'addEventListener("load",function(){navigator.serviceWorker.register("demo-sw.js").catch(function(){})});</script>';

let s = fs.readFileSync(src, 'utf8');
const anchor = '<meta name="viewport"';
if (s.indexOf(anchor) < 0) { console.error('não achei a âncora do cabeçalho em ' + src); process.exit(1); }
s = s.replace(anchor, HEAD + anchor);
// `</body>` também aparece dentro de textos do próprio app, então vale o ÚLTIMO, que é o do documento.
const end = s.lastIndexOf('</body>');
if (end < 0) { console.error('não achei o fim do corpo em ' + src); process.exit(1); }
s = s.slice(0, end) + REG + s.slice(end);
fs.writeFileSync(dst, s);
console.log('make-pages OK (' + dst + ', ' + s.length + ' bytes).');
