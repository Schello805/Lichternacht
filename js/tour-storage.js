import { stationCoordinates } from './round-trip.js?v=1.4.309';

export const TOUR_STORAGE_KEY = 'active_station_tour_v1';

export function readSavedTour(storage, stations) {
    try {
        const tour = JSON.parse(storage.getItem(TOUR_STORAGE_KEY));
        if (!tour || tour.version !== 1 || !['round', 'open'].includes(tour.mode)) return null;
        if (!Array.isArray(tour.stationIds) || tour.stationIds.length < 2 || new Set(tour.stationIds).size !== tour.stationIds.length) return null;
        const available = new Map(stations.map(station => [String(station.id), station]));
        if (!tour.stationIds.every(id => typeof id === 'string' && stationCoordinates(available.get(id)))) return null;
        if (!stationCoordinates(tour.origin) || !Number.isInteger(tour.progress) || tour.progress < 0 || tour.progress > tour.stationIds.length) return null;
        if (![tour.reached, tour.skipped].every(value => Number.isInteger(value) && value >= 0) || tour.reached + tour.skipped !== tour.progress) return null;
        if (tour.progress === tour.stationIds.length && tour.mode !== 'round') return null;
        if (tour.geometry?.type !== 'LineString' || !Array.isArray(tour.geometry.coordinates) || tour.geometry.coordinates.length < 2 || !tour.geometry.coordinates.every(coordinate => Array.isArray(coordinate) && stationCoordinates({ lng: coordinate[0], lat: coordinate[1] }))) return null;
        if (typeof tour.summary !== 'string' || tour.summary.length > 200) return null;
        return { ...tour, stations: tour.stationIds.map(id => available.get(id)) };
    } catch {
        return null;
    }
}

export function saveTour(storage, state) {
    try {
        if (!state.overviewRouteNavigationActive || state.overviewRouteCompleted) {
            storage.removeItem(TOUR_STORAGE_KEY);
            return true;
        }
        const serialized = JSON.stringify({
            version: 1, mode: state.overviewRouteMode,
            stationIds: state.overviewRouteStations.map(station => String(station.id)),
            origin: state.overviewRouteOrigin, geometry: state.overviewRouteGeometry,
            progress: state.overviewRouteNavigationProgress,
            reached: state.overviewRouteReached, skipped: state.overviewRouteSkipped,
            summary: state.overviewRouteSummary
        });
        if (storage.getItem(TOUR_STORAGE_KEY) !== serialized) storage.setItem(TOUR_STORAGE_KEY, serialized);
        return true;
    } catch {
        return false;
    }
}
