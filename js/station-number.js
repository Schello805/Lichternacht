export function normalizeStationNumber(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const match = String(value).trim().toUpperCase().match(/^([1-9]\d*)([A-Z]?)$/);
    if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
    return match[2] ? `${Number(match[1])}${match[2]}` : Number(match[1]);
}

export function getStationNumber(station) {
    return normalizeStationNumber(station?.number) ?? station?.id ?? '';
}

export function compareStationNumbers(first, second) {
    return String(getStationNumber(first)).localeCompare(String(getStationNumber(second)), 'de', { numeric: true });
}
