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

// ── Push Notifications ────────────────────────────────────────
/**
 * Recebe evento push do servidor (via Supabase Edge Function + Web Push Protocol).
 * Exibe notificação nativa no dispositivo — funciona mesmo com o app fechado.
 */
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'StudyQuest', body: event.data.text(), data: {} }; }

  const title   = payload.title || 'StudyQuest';
  const options = {
    body:    payload.body    || '',
    icon:    payload.icon    || './icon.svg',
    badge:   payload.badge   || './icon.svg',
    tag:     payload.tag     || 'studyquest-notif',   // agrupa notifs do mesmo tipo
    renotify: !!payload.renotify,                     // vibra mesmo se o tag já existir
    data:    payload.data    || {},
    actions: payload.actions || [],
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/**
 * Usuário clicou na notificação ou num botão de ação dela.
 * Foca a aba existente ou abre uma nova, navegando para a página correta.
 */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data     = event.notification.data || {};
  const page     = data.page   || 'dashboard';   // ex: 'friends', 'groups', 'missions'
  const targetUrl = data.url   || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Se já há uma aba aberta com o app, foca ela e envia mensagem para navegar
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'SW_NAVIGATE', page });
          return;
        }
      }
      // Nenhuma aba aberta → abre o app com o parâmetro de página
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl + (page !== 'dashboard' ? `#${page}` : ''));
      }
    })
  );
});

/**
 * Push subscription foi revogada pelo browser (ex: usuário desativou nas config do SO).
 * Registra o evento — o backend pode limpar a subscription da tabela.
 */
self.addEventListener('pushsubscriptionchange', event => {
  console.log('[SW] Push subscription mudou — resubscrevendo...');
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self._vapidPublicKey,
    }).then(sub => {
      // Envia nova subscription para o app via postMessage
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_PUSH_RESUBSCRIBED', subscription: sub.toJSON() }));
      });
    }).catch(err => console.warn('[SW] Falha ao resubscrever:', err))
  );
});
