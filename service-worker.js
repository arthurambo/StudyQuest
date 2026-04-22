/* =============================================
   STUDYQUEST — SERVICE WORKER
   Estratégia: Network-first com fallback para cache
   ============================================= */

const CACHE_NAME  = 'studyquest-v1';
const CACHE_PAGES = 'studyquest-pages-v1';

// Arquivos do app shell — sempre em cache
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.svg',
];

// ── Instalação: pré-cacheia o app shell ─────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando e cacheando app shell...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())  // ativa imediatamente
  );
});

// ── Ativação: limpa caches antigos ──────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativado — limpando caches antigos...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== CACHE_PAGES)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())  // assume controle imediato
  );
});

// ── Fetch: network-first para o app, cache para assets ──────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições externas (CDN, Supabase, Google Fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // Ignora métodos não-GET
  if (request.method !== 'GET') return;

  // App shell: cache-first (muda raramente)
  const isShellFile = APP_SHELL.some(path => {
    const clean = path.replace('./', '');
    return url.pathname.endsWith(clean) || url.pathname === self.registration.scope;
  });

  if (isShellFile) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Demais requisições: network-first com fallback
  event.respondWith(networkFirst(request));
});

// ── Estratégia: cache-first ──────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — arquivo não encontrado no cache.', { status: 503 });
  }
}

// ── Estratégia: network-first ────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_PAGES);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback: retorna index.html para navegação SPA
    const fallback = await caches.match('./index.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}
