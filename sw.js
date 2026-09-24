const WIDGET_TAG = 'sq-streak';
const DATA_CACHE = 'sq-widget-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('widgetinstall', e => {
  e.waitUntil(_refreshWidget());
});

self.addEventListener('widgetresume', e => {
  e.waitUntil(_refreshWidget());
});

self.addEventListener('widgetuninstall', () => {});

self.addEventListener('widgetclick', e => {
  e.waitUntil(self.clients.openWindow('./'));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SQ_WIDGET_UPDATE') {
    _saveData(e.data.payload).then(() => _refreshWidget());
  }
});

async function _saveData(payload) {
  const cache = await caches.open(DATA_CACHE);
  await cache.put('/sq-widget-data', new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function _loadData() {
  try {
    const cache = await caches.open(DATA_CACHE);
    const res = await cache.match('/sq-widget-data');
    if (res) return await res.json();
  } catch {}
  return { streak: 0, message: 'Comece a estudar hoje!' };
}

function _buildMessage(streak) {
  if (streak === 0) return 'Comece a estudar hoje!';
  if (streak === 1) return 'Primeiro dia! Continue assim!';
  if (streak < 7)   return `${streak} dias seguidos!`;
  if (streak === 7) return 'Uma semana de ofensiva!';
  if (streak < 30)  return `Incrível! ${streak} dias!`;
  if (streak === 30) return 'Um mês de ofensiva!';
  return `Lendário! ${streak} dias!`;
}

async function _refreshWidget() {
  if (!self.widgets) return;
  const widget = await self.widgets.getByTag(WIDGET_TAG);
  if (!widget) return;
  const data = await _loadData();
  data.message = _buildMessage(data.streak || 0);
  await self.widgets.updateByTag(WIDGET_TAG, { data: JSON.stringify(data) });
}
