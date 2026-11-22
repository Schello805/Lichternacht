import { distanceMeters, stationCoordinates } from './round-trip.js?v=1.4.340';

export function shouldMoveGpsMarker(previous, current) {
    const next = stationCoordinates(current);
    if (!next) return false;
    const displayed = stationCoordinates(previous);
    return !displayed || distanceMeters(displayed, next) >= 5;
}

export function shouldAcceptGpsPosition(position, previous, now = Date.now()) {
    const latitude = position?.coords?.latitude;
    const longitude = position?.coords?.longitude;
    const accuracy = position?.coords?.accuracy;
    const timestamp = position?.timestamp;
    if (![latitude, longitude, accuracy, timestamp].every(Number.isFinite)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0
        || timestamp > now || now - timestamp > 15000) return false;
    const lastTimestamp = previous?.gpsLastFixAt;
    const lastAccuracy = previous?.gpsAccuracy;
    if (!previous?.userLocation || !Number.isFinite(lastTimestamp)) return true;
    if (timestamp < lastTimestamp) return false;
    if (timestamp === lastTimestamp && Number.isFinite(lastAccuracy) && accuracy >= lastAccuracy) return false;
    const previousIsFresh = now >= lastTimestamp && now - lastTimestamp <= 15000;
    return !previousIsFresh || !Number.isFinite(lastAccuracy) || accuracy <= Math.max(20, lastAccuracy * 2);
}
