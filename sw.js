// KILLER SERVICE WORKER
// This file exists solely to replace the old 'sw.js' on clients that are stuck with a cached index.html.
// It immediately claims clients and unregisters itself.

self.addEventListener('install', () => {
    // Skip waiting to activate immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        self.registration.unregister().then(() => {
            return self.clients.matchAll();
        }).then((clients) => {
            // Force all open client windows to reload to get the new index.html
            clients.forEach(client => client.navigate(client.url));
        })
    );
});
