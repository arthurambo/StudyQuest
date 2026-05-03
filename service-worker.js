/* =============================================
   STUDYQUEST — SERVICE WORKER
   Estratégia: Network-first para tudo
   Cache serve APENAS como fallback offline.
   Incrementar CACHE_NAME a cada deploy garante
   que caches antigos sejam apagados.
   ============================================= */

// ⚠️ Mude este valor a cada deploy para forçar atualização em todos os clientes.
// Exemplo: studyquest-cache-20260502
const CACHE_NAME = 'studyquest-cache-2';

// Arquivos para pré-cachear no install (fallback offline)
const OFFLINE_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.svg',
];

// ── Instalação ───────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando —', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(OFFLINE_SHELL))
      .then(() => self.skipWaiting())   // ativa imediatamente sem esperar aba fechar
  );
});

// ── Ativação ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativado —', CACHE_NAME);
  event.waitUntil(
    // Apaga TODOS os caches com nomes diferentes do atual
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Removendo cache antigo:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())  // assume controle de todas as abas abertas
  );
});

// ── Fetch: network-first ──────────────────────────────────────
// Sempre tenta a rede. Se falhar (offline), usa o cache.
// Isso garante que o usuário sempre receba a versão mais recente quando online.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições externas (Supabase, CDN, Google Fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // Ignora métodos não-GET
  if (request.method !== 'GET') return;

  event.respondWith(networkFirst(request));
});

// ── Estratégia: network-first ─────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Cacheia resposta válida para uso offline futuro
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Sem rede — tenta o cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback final: retorna index.html para SPA (navegação sem arquivo direto)
    const fallback = await caches.match('./index.html');
    return fallback || new Response('Offline — sem conexão e sem cache disponível.', { status: 503 });
  }
}
