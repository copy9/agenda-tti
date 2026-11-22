// Service worker da demonstração publicada no GitHub Pages.
// Só existe para a demonstração poder ser instalada no celular e abrir sem rede.
// A versão de servidor usa public/sw.js, que também trata avisos push.
const CACHE = 'tti-demo-v1';
const SHELL = './';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) { if (k !== CACHE) await caches.delete(k); }
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== self.location.origin) return;

  // A tela tenta a rede primeiro: assim a demonstração nunca fica presa numa versão antiga.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (net && net.ok) { const c = await caches.open(CACHE); c.put(SHELL, net.clone()); }
        return net;
      } catch (x) {
        return (await caches.match(SHELL)) || new Response('<!doctype html><meta charset="utf-8"><title>Agenda TTI</title><p style="font:16px system-ui;padding:24px">Sem conexão. Abra de novo quando a internet voltar.', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  if (/\/public\/app\//.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const net = await fetch(req);
      if (net && net.ok) { const c = await caches.open(CACHE); c.put(req, net.clone()); }
      return net;
    })());
  }
});
