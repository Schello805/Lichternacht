export function buildGoogleNavigationUrl(latitude, longitude, mode = 'walking') {
    if (latitude == null || longitude == null || String(latitude).trim() === '' || String(longitude).trim() === '') return null;
    const lat = Number(latitude), lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !['walking', 'driving'].includes(mode)) return null;
    const url = new URL('https://www.google.com/maps/dir/');
    url.search = new URLSearchParams({ api: '1', destination: `${lat},${lng}`, travelmode: mode, dir_action: 'navigate' });
    return url.href;
}
