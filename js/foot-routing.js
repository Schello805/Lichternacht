import { stationCoordinates } from './round-trip.js?v=1.4.301';

const BASE = 'https://routing.openstreetmap.de/routed-foot';
const cache = new Map();

export function optimizeWalkingOrder(matrix, count, mode = 'round', hasOrigin = false) {
    if (count < 2 || matrix.length !== count + Number(hasOrigin) || matrix.some(row => row.length !== matrix.length || row.some(value => !Number.isFinite(value) || value < 0))) {
        throw new Error('Nicht alle Stationen sind über Fußwege erreichbar.');
    }
    const score = order => order.slice(1).reduce((total, target, index) => total + matrix[order[index]][target], hasOrigin ? matrix[count][order[0]] : 0)
        + (mode === 'round' ? matrix[order.at(-1)][order[0]] : 0);
    if (hasOrigin) {
        const pending = new Set(Array.from({ length: count }, (_, index) => index));
        const order = [];
        let current = count;
        while (pending.size) {
            const next = [...pending].reduce((best, candidate) => matrix[current][candidate] < matrix[current][best] ? candidate : best);
            order.push(next);
            pending.delete(next);
            current = next;
        }
        return order;
    }
    let best = null;
    let bestScore = Infinity;
    let checks = 0;
    for (let start = 0; start < count; start += 1) {
        const pending = new Set(Array.from({ length: count }, (_, index) => index).filter(index => index !== start));
        let order = [start];
        while (pending.size) {
            const next = [...pending].reduce((best, candidate) => matrix[order.at(-1)][candidate] < matrix[order.at(-1)][best] ? candidate : best);
            order.push(next);
            pending.delete(next);
        }
        let cost = score(order);
        let improved = true;
        while (improved && checks < 20000) {
            improved = false;
            for (let first = 1; first < count - 1 && checks < 20000; first += 1) {
                for (let last = first + 1; last < count && checks < 20000; last += 1) {
                    checks += 1;
                    const candidate = [...order.slice(0, first), ...order.slice(first, last + 1).reverse(), ...order.slice(last + 1)];
                    const candidateCost = score(candidate);
                    if (candidateCost + 0.01 < cost) { order = candidate; cost = candidateCost; improved = true; }
                }
            }
        }
        if (cost < bestScore) { best = order; bestScore = cost; }
    }
    return best;
}

async function request(path, signal) {
    signal?.throwIfAborted();
    const stored = cache.get(path);
    if (stored && Date.now() - stored.time < 600000) return stored.value;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 10000);
        try {
            signal?.throwIfAborted();
            const response = await fetch(`${BASE}/${path}`, { signal: controller.signal });
            if (!response.ok) {
                const error = new Error('Fußweg-Dienst nicht erreichbar.');
                error.permanent = response.status < 500;
                throw error;
            }
            const value = await response.json();
            if (value.code !== 'Ok') {
                const error = new Error('Keine durchgängige Fußwegverbindung gefunden.');
                error.permanent = true;
                throw error;
            }
            if (cache.size >= 30) cache.delete(cache.keys().next().value);
            cache.set(path, { time: Date.now(), value });
            return value;
        } catch (error) {
            signal?.throwIfAborted();
            if (attempt || error.permanent) throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }
}

function coordinatePath(coordinates) {
    if (coordinates.length < 2 || coordinates.some(point => !Array.isArray(point) || !stationCoordinates({ lng: point[0], lat: point[1] }))) throw new Error('Ungültige Kartenposition.');
    return coordinates.map(point => point.join(',')).join(';');
}

export async function fetchFootRoute(coordinates, signal) {
    const value = await request(`route/v1/driving/${coordinatePath(coordinates)}?overview=full&geometries=geojson&continue_straight=false`, signal);
    const route = value.routes?.[0];
    if (route?.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2
        || route.geometry.coordinates.some(point => !Array.isArray(point) || !stationCoordinates({ lng: point[0], lat: point[1] }))
        || !Number.isFinite(route.distance) || route.distance < 0 || !Number.isFinite(route.duration) || route.duration < 0) throw new Error('Ungültige Fußwegberechnung.');
    if (value.waypoints?.some(point => !Number.isFinite(point.distance) || point.distance > 100)) throw new Error('Eine Position liegt zu weit vom erfassten Fußweg entfernt.');
    return route;
}

export async function planWalkingTour(stations, mode, origin, signal) {
    const points = stations.map(stationCoordinates);
    const matrixPoints = origin ? [...points, origin] : points;
    const table = await request(`table/v1/driving/${coordinatePath(matrixPoints)}?annotations=duration`, signal);
    if (!Array.isArray(table.durations)) throw new Error('Fußwegzeiten sind nicht verfügbar.');
    const order = optimizeWalkingOrder(table.durations, stations.length, mode, Boolean(origin));
    const coordinates = order.map(index => points[index]);
    if (origin) coordinates.unshift([...origin]);
    if (mode === 'round') coordinates.push([...coordinates[0]]);
    const route = await fetchFootRoute(coordinates, signal);
    return { stations: order.map(index => stations[index]), route };
}
