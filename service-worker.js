importScripts('vendor/workbox/workbox-sw.js');

const CACHE_NAME = 'lichternacht-v1.4.37';

if (workbox) {
    console.log(`Yay! Workbox is loaded 🎉`);

    // Precache & Route
    // Wir nutzen hier Runtime Caching für alles, da wir keine Build-Step haben.

    // Explicitly deny caching for Firestore/Google APIs (Network Only)
    // We do NOT register a route for them, so they fall through to the browser network handler
    
    // Cache HTML, CSS, JS, Manifest (Same Origin Only)
    workbox.routing.registerRoute(
        ({ request, url }) => {
            // REDUNDANT SAFETY: Explicitly exclude external APIs
            if (url.href.includes('firestore.googleapis.com') || 
                url.href.includes('googleapis.com') || 
                url.href.includes('firebase')) {
                return false;
            }

            // STRICT SAFETY: Only cache same-origin requests
            if (url.origin !== self.location.origin) {
                return false;
            }

            return request.destination === 'document' ||
                request.destination === 'script' ||
                request.destination === 'style' ||
                request.destination === 'worker';
        },
        new workbox.strategies.NetworkFirst({
            cacheName: CACHE_NAME,
            networkTimeoutSeconds: 3,
        })
    );

    // Cache Images (Same Origin Only)
    workbox.routing.registerRoute(
        ({ request, url }) => {
            // REDUNDANT SAFETY: Explicitly exclude external APIs
            if (url.href.includes('firestore.googleapis.com') || 
                url.href.includes('googleapis.com') || 
                url.href.includes('firebase')) {
                return false;
            }

            // STRICT SAFETY: Only cache same-origin requests
            if (url.origin !== self.location.origin) {
                return false;
            }
            return request.destination === 'image';
        },
        new workbox.strategies.CacheFirst({
            cacheName: 'images',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 60,
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                }),
            ],
        })
    );

    // Cache Fonts (Google Fonts)
    workbox.routing.registerRoute(
        ({ url }) => url.origin === 'https://fonts.googleapis.com' ||
            url.origin === 'https://fonts.gstatic.com',
        new workbox.strategies.StaleWhileRevalidate({
            cacheName: 'google-fonts',
        })
    );

    // Offline Fallback Page (Optional, aber gut)
    // workbox.recipes.pageCache();

} else {
    console.log(`Boo! Workbox didn't load grimacing`);
}

// Force Update
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== 'images' && cacheName !== 'google-fonts') {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});
