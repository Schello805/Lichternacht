export function getFeedbackLocation(geolocation = globalThis.navigator?.geolocation) {
    if (!geolocation) return Promise.resolve(null);
    return new Promise(resolve => {
        let timeout;
        const finish = location => { clearTimeout(timeout); resolve(location); };
        timeout = setTimeout(() => finish(null), 10000);
        try {
            geolocation.getCurrentPosition(position => {
                const { latitude, longitude, accuracy } = position?.coords || {};
                const captured = new Date(Number.isFinite(position?.timestamp) ? position.timestamp : Date.now());
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(captured.getTime())) return finish(null);
                finish({ lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null, capturedAt: captured.toISOString() });
            }, () => finish(null), { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 });
        } catch { finish(null); }
    });
}
