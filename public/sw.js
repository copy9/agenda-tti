// Service worker do aplicativo: avisos push e funcionamento com rede ruim.
//
// Regra de ouro do cache: a tela nunca é servida do cache quando há rede. A navegação tenta a
// rede primeiro e só cai no cache se ela falhar — assim um aplicativo instalado nunca fica
// preso numa versão antiga depois de uma atualização do servidor. Nada de /api entra em cache:
// proposta, bloqueio e reserva têm de vir do servidor, sempre.
const CACHE = 'tti-app-v1';
const SHELL = '/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) { if (k !== CACHE) await caches.delete(k); }
  await self.clients.claim();
})()));

const offlinePage = () => new Response(
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Agenda TTI</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#F5F2EC;color:#14262E;'
  + 'font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}p{max-width:30ch;color:#5C6B70}</style>'
  + '<div><h1>Sem conexão</h1><p>Abra de novo quando a internet voltar. Nada do que você fez foi perdido.</p></div>',
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // dados sempre do servidor

  // Telas: rede primeiro, cache como reserva para quando a rede falhar.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (net && net.ok) { const c = await caches.open(CACHE); c.put(SHELL, net.clone()); }
        return net;
      } catch (x) {
        return (await caches.match(SHELL)) || offlinePage();
      }
    })());
    return;
  }

  // Ícones e manifest: cache primeiro, porque não mudam entre versões.
  if (url.pathname.startsWith('/app/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const net = await fetch(req);
      if (net && net.ok) { const c = await caches.open(CACHE); c.put(req, net.clone()); }
      return net;
    })());
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  e.waitUntil(self.registration.showNotification(String(d.title || 'Agenda TTI').slice(0, 120), {
    body: String(d.body || '').slice(0, 300),
    tag: d.tag ? String(d.tag).slice(0, 80) : undefined,
    icon: '/app/icon-192.png',
    badge: '/app/icon-192.png',
    data: { url: String(d.url || '/') },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let url = '/';
  try { const u = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin); if (u.origin === self.location.origin) url = u.href; } catch (x) { /* usa a raiz */ }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
