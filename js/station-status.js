export function isStationCancelled(station) {
    return station?.cancelled === true;
}

export function countAvailableStations(stations) {
    return (Array.isArray(stations) ? stations : []).filter(station => !isStationCancelled(station)).length;
}
