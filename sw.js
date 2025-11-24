const CACHE_NAME = 'lichternacht-v3';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.png',
    './style.css',
    './app.js',
    './config.js',
    './js/state.js',
    './js/utils.js',
    './js/firebase-init.js',
    './js/data.js',
    './js/map.js',
    './js/gamification.js',
    './js/ui.js',
    './js/auth.js',
    './js/admin.js',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@300;400;700&display=swap',
    'https://unpkg.com/@phosphor-icons/web',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js'
];

// Install: Cache Core Assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch Strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Cache First: Images, Fonts, Tiles, CSS Libraries
    if (url.hostname.includes('cartocdn') ||
        url.pathname.match(/\.(png|jpg|jpeg|svg|woff2|ttf)$/) ||
        url.hostname.includes('unpkg.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('cdn.tailwindcss.com')) {

        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // 2. Network First: HTML, JS, JSON (App Logic)
    // Versuche erst Netzwerk, wenn das fehlschlägt, nimm Cache.
    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            return caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
            });
        }).catch(() => {
            return caches.match(event.request);
        })
    );
});
