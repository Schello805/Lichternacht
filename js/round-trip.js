export const STATION_ARRIVAL_RADIUS_METERS = 20;

export function stationCoordinates(station) {
    const values = [station?.lng, station?.lat];
    if (values.some(value => value == null || typeof value === 'boolean' || String(value).trim() === '')) return null;
    const [longitude, latitude] = values.map(Number);
    return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90
        ? [longitude, latitude] : null;
}

export function distanceMeters(start, end) {
    const radians = Math.PI / 180;
    const value = Math.sin((end[1] - start[1]) * radians / 2) ** 2
        + Math.cos(start[1] * radians) * Math.cos(end[1] * radians) * Math.sin((end[0] - start[0]) * radians / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}

export function buildRoundTrip(stations, stationIds = null, maxChecks = 20000, mode = 'round', origin = null) {
    const selected = Array.isArray(stationIds) ? new Set(stationIds.map(String)) : null;
    const remaining = stations.filter(station => stationCoordinates(station) && (!selected || selected.has(String(station.id))))
        .map(station => ({ station, coordinates: stationCoordinates(station) }))
        .sort((first, second) => String(first.station.id).localeCompare(String(second.station.id), undefined, { numeric: true }));
    if (remaining.length < 2) return { coordinates: [], stations: [] };
    if (mode === 'open') {
        const starts = origin
            ? [remaining.reduce((best, item) => distanceMeters(origin, item.coordinates) < distanceMeters(origin, best.coordinates) ? item : best)]
            : remaining;
        let bestRoute = null;
        let bestLength = Infinity;
        for (const start of starts) {
            const pending = remaining.filter(item => item !== start);
            const ordered = [start];
            while (pending.length) {
                const current = ordered.at(-1).coordinates;
                const next = pending.reduce((best, item, index) => distanceMeters(current, item.coordinates) < distanceMeters(current, pending[best].coordinates) ? index : best, 0);
                ordered.push(pending.splice(next, 1)[0]);
            }
            let checks = 0;
            let improved = true;
            while (improved && checks < maxChecks) {
                improved = false;
                for (let first = 1; first < ordered.length - 1 && checks < maxChecks; first += 1) {
                    for (let last = first + 1; last < ordered.length && checks < maxChecks; last += 1) {
                        checks += 1;
                        const before = ordered[first - 1].coordinates;
                        const after = ordered[last + 1]?.coordinates;
                        const previous = distanceMeters(before, ordered[first].coordinates) + (after ? distanceMeters(ordered[last].coordinates, after) : 0);
                        const next = distanceMeters(before, ordered[last].coordinates) + (after ? distanceMeters(ordered[first].coordinates, after) : 0);
                        if (next + 0.01 < previous) {
                            ordered.splice(first, last - first + 1, ...ordered.slice(first, last + 1).reverse());
                            improved = true;
                        }
                    }
                }
            }
            const length = ordered.slice(1).reduce((total, item, index) => total + distanceMeters(ordered[index].coordinates, item.coordinates), 0);
            if (length < bestLength) { bestLength = length; bestRoute = ordered; }
        }
        return { stations: bestRoute.map(item => item.station), coordinates: bestRoute.map(item => item.coordinates) };
    }
    const ordered = [remaining.shift()];
    while (remaining.length) {
        const current = ordered.at(-1).coordinates;
        const next = remaining.reduce((best, candidate, index) => distanceMeters(current, candidate.coordinates) < distanceMeters(current, remaining[best].coordinates) ? index : best, 0);
        ordered.push(remaining.splice(next, 1)[0]);
    }
    let checks = 0;
    let improved = true;
    while (improved && checks < maxChecks) {
        improved = false;
        for (let first = 1; first < ordered.length - 1 && checks < maxChecks; first += 1) {
            for (let last = first + 1; last < ordered.length && checks < maxChecks; last += 1) {
                checks += 1;
                const before = ordered[first - 1].coordinates;
                const after = ordered[(last + 1) % ordered.length].coordinates;
                const oldDistance = distanceMeters(before, ordered[first].coordinates) + distanceMeters(ordered[last].coordinates, after);
                const newDistance = distanceMeters(before, ordered[last].coordinates) + distanceMeters(ordered[first].coordinates, after);
                if (newDistance + 0.01 < oldDistance) {
                    ordered.splice(first, last - first + 1, ...ordered.slice(first, last + 1).reverse());
                    improved = true;
                }
            }
        }
    }
    return { stations: ordered.map(item => item.station), coordinates: [...ordered.map(item => item.coordinates), ordered[0].coordinates] };
}

export function hasNavigationFix(state, now = Date.now()) {
    return Boolean(stationCoordinates(state.userLocation)) && Number.isFinite(state.gpsAccuracy)
        && state.gpsAccuracy >= 0 && state.gpsAccuracy <= 50 && Number.isFinite(state.gpsLastFixAt)
        && now >= state.gpsLastFixAt && now - state.gpsLastFixAt <= 15000;
}

export function canConfirmTarget(state, target, now = Date.now()) {
    return hasNavigationFix(state, now) && Boolean(stationCoordinates(target))
        && distanceMeters(stationCoordinates(state.userLocation), stationCoordinates(target)) <= STATION_ARRIVAL_RADIUS_METERS;
}

export function targetDistanceLabel(state, target, now = Date.now()) {
    if (!hasNavigationFix(state, now)) return 'Entfernung: frisches, genaues GPS erforderlich';
    const coordinates = stationCoordinates(target);
    if (!coordinates) return 'Entfernung nicht verfügbar';
    const distance = distanceMeters(stationCoordinates(state.userLocation), coordinates);
    const label = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
    return `Zum Ziel: ca. ${label} Luftlinie (GPS ±${Math.ceil(state.gpsAccuracy)} m)`;
}
