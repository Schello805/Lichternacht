export function getStationNumber(station) {
    const value = station?.number;
    return (typeof value === 'number' || typeof value === 'string') && /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0
        ? Number(value) : station?.id ?? '';
}

export function compareStationNumbers(first, second) {
    return String(getStationNumber(first)).localeCompare(String(getStationNumber(second)), 'de', { numeric: true });
}
