export function normalizeImageUrl(value, baseUrl = globalThis.location?.origin || 'http://localhost') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(raw)) return raw;

    try {
        const url = new URL(raw, baseUrl);
        return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
    } catch {
        return '';
    }
}
