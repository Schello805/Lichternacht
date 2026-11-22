self.addEventListener('push', event => {
    event.waitUntil((async () => {
        let payload;
        try { payload = event.data?.json(); } catch { return; }
        if (payload?.type !== 'program-reminder' || typeof payload.title !== 'string'
            || typeof payload.body !== 'string' || !Number.isFinite(payload.expiresAt)
            || payload.expiresAt <= Date.now()) return;
        await self.registration.showNotification(payload.title.slice(0, 180), {
            body: payload.body.slice(0, 200), tag: String(payload.tag || 'program-reminder').slice(0, 100),
            data: { url: '/#events' }, renotify: false
        });
    })());
});

self.addEventListener('notificationclick', event => {
    if (!String(event.notification.tag || '').startsWith('program-')) return;
    event.notification.close();
    event.waitUntil((async () => {
        const target = new URL('/#events', self.location.origin).href;
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
        if (existing) {
            await existing.navigate(target);
            return existing.focus();
        }
        return self.clients.openWindow(target);
    })());
});
