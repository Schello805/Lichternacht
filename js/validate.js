function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
}

export function validateStations(stations) {
    const issues = [];
    const seenIds = new Map();

    const list = Array.isArray(stations) ? stations : [];
    list.forEach((s, idx) => {
        const path = `stations[${idx}]`;
        const id = s?.id;
        const idStr = (id === null || id === undefined) ? '' : String(id).trim();
        if (!idStr) {
            issues.push({ severity: 'error', where: path, field: 'id', message: 'id fehlt' });
        } else {
            const prev = seenIds.get(idStr);
            if (prev !== undefined) {
                issues.push({ severity: 'error', where: path, field: 'id', message: `doppelte id (${idStr}), schon bei stations[${prev}]` });
            } else {
                seenIds.set(idStr, idx);
            }
        }

        if (!isNonEmptyString(s?.name)) {
            issues.push({ severity: 'error', where: path, field: 'name', message: 'Name fehlt/leer' });
        }

        const lat = toNumber(s?.lat);
        const lng = toNumber(s?.lng);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            issues.push({ severity: 'error', where: path, field: 'lat', message: `ungültig (${s?.lat})` });
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
            issues.push({ severity: 'error', where: path, field: 'lng', message: `ungültig (${s?.lng})` });
        }

        if (!Array.isArray(s?.tags)) {
            issues.push({ severity: 'warn', where: path, field: 'tags', message: 'tags ist kein Array (Filter könnten nicht funktionieren)' });
        }

        if (!isNonEmptyString(s?.desc)) {
            issues.push({ severity: 'warn', where: path, field: 'desc', message: 'Beschreibung fehlt' });
        }
    });

    return issues;
}

export function validateEvents(events) {
    const issues = [];
    const seenIds = new Map();

    const list = Array.isArray(events) ? events : [];
    list.forEach((e, idx) => {
        const path = `events[${idx}]`;
        const id = e?.id;
        const idStr = (id === null || id === undefined) ? '' : String(id).trim();
        if (!idStr) {
            issues.push({ severity: 'error', where: path, field: 'id', message: 'id fehlt' });
        } else {
            const prev = seenIds.get(idStr);
            if (prev !== undefined) {
                issues.push({ severity: 'error', where: path, field: 'id', message: `doppelte id (${idStr}), schon bei events[${prev}]` });
            } else {
                seenIds.set(idStr, idx);
            }
        }

        if (!isNonEmptyString(e?.time)) {
            issues.push({ severity: 'error', where: path, field: 'time', message: 'Zeit fehlt' });
        }
        if (!isNonEmptyString(e?.title)) {
            issues.push({ severity: 'error', where: path, field: 'title', message: 'Titel fehlt' });
        }

        // Coordinates are optional for events, but if provided they must be valid.
        const hasLat = e?.lat !== undefined && e?.lat !== null && String(e?.lat).trim() !== '';
        const hasLng = e?.lng !== undefined && e?.lng !== null && String(e?.lng).trim() !== '';
        if (hasLat || hasLng) {
            const lat = toNumber(e?.lat);
            const lng = toNumber(e?.lng);
            if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                issues.push({ severity: 'warn', where: path, field: 'lat', message: `ungültig (${e?.lat})` });
            }
            if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
                issues.push({ severity: 'warn', where: path, field: 'lng', message: `ungültig (${e?.lng})` });
            }
        }
    });

    return issues;
}

