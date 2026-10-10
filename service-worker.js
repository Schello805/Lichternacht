importScripts('vendor/workbox/workbox-sw.js');

const CACHE_NAME = 'lichternacht-v1.4.199';
const STATIC_CACHE = `${CACHE_NAME}-static`;
const IMAGE_CACHE = 'images';
const FONT_CACHE = 'google-fonts';
const MAP_CACHE = 'map-tiles';

function isFirebaseOrGoogleApi(url) {
    return url.href.includes('firestore.googleapis.com') ||
        url.href.includes('googleapis.com') ||
        url.href.includes('firebase');
}

function isSameOriginAppAsset(request, url) {
    if (isFirebaseOrGoogleApi(url)) return false;
    if (url.origin !== self.location.origin) return false;
    return request.destination === 'document' ||
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'worker' ||
        request.destination === 'manifest';
}

if (workbox) {
    console.log(`Yay! Workbox is loaded 🎉`);
    workbox.core.skipWaiting();
    workbox.core.clientsClaim();

    workbox.routing.registerRoute(
        ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('/config.js'),
        new workbox.strategies.NetworkOnly()
    );

    workbox.routing.registerRoute(
        ({ request, url }) => isSameOriginAppAsset(request, url),
        new workbox.strategies.NetworkFirst({
            cacheName: STATIC_CACHE,
            networkTimeoutSeconds: 3,
        })
    );

    workbox.routing.registerRoute(
        ({ request, url }) => {
            if (isFirebaseOrGoogleApi(url)) return false;
            if (url.origin !== self.location.origin) return false;
            return request.destination === 'image';
        },
        new workbox.strategies.CacheFirst({
            cacheName: IMAGE_CACHE,
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 100,
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                }),
            ],
        })
    );

    workbox.routing.registerRoute(
        ({ url }) => url.origin === 'https://fonts.googleapis.com' ||
            url.origin === 'https://fonts.gstatic.com',
        new workbox.strategies.StaleWhileRevalidate({
            cacheName: FONT_CACHE,
        })
    );

    workbox.routing.registerRoute(
        ({ url }) => url.hostname.endsWith('openfreemap.org') || url.hostname.endsWith('openstreetmap.org'),
        new workbox.strategies.CacheFirst({
            cacheName: MAP_CACHE,
            plugins: [
                new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 300,
                    maxAgeSeconds: 7 * 24 * 60 * 60,
                }),
            ],
        })
    );
} else {
    console.log(`Boo! Workbox didn't load grimacing`);
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (![STATIC_CACHE, IMAGE_CACHE, FONT_CACHE, MAP_CACHE].includes(cacheName)) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});
