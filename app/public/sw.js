const CACHE = 'agenda-plus-v1';
const ESSENCIAIS = [
  '/index.html',
  '/css/app.css',
  '/css/futurista.css',
  '/js/api.js',
  '/js/app.js',
  '/manifest.webmanifest',
  '/images/icons/icon-192.png',
  '/images/icons/icon-512.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Nunca cachear chamadas de API (dados em tempo real)
  if (url.pathname.startsWith('/api/')) return;

  // Navegação: rede primeiro, cai para o cache offline
  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copia));
          return resp;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Arquivos estáticos: cache primeiro, atualiza em segundo plano
  evento.respondWith(
    caches.match(req).then((emCache) => {
      const busca = fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      }).catch(() => emCache);
      return emCache || busca;
    })
  );
});
