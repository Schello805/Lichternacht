importScripts('vendor/workbox/workbox-sw.js');

if (workbox) {
    console.log(`Yay! Workbox is loaded 🎉`);

    // Precache & Route
    // Wir nutzen hier Runtime Caching für alles, da wir keine Build-Step haben.

    // Cache HTML, CSS, JS (inkl. lokale Vendor-Files)
    workbox.routing.registerRoute(
        ({ request }) => request.destination === 'document' ||
            request.destination === 'script' ||
            request.destination === 'style' ||
            request.destination === 'worker',
        new workbox.strategies.StaleWhileRevalidate({
            cacheName: CACHE_NAME,
        })
    );

    // Cache Images
    workbox.routing.registerRoute(
        ({ request }) => request.destination === 'image',
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
