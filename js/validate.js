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
        const id = s?.id;
        const name = s?.name;
        const idStr = (id === null || id === undefined) ? '' : String(id).trim();
        const label = idStr ? `Station ${idStr}${isNonEmptyString(name) ? ` (${name.trim()})` : ''}` : `Station (ohne id)`;
        const path = `stations[${idx}]`;
        if (!idStr) {
            issues.push({ severity: 'error', where: path, label, stationId: null, stationName: isNonEmptyString(name) ? name.trim() : '', field: 'id', message: 'id fehlt' });
        } else {
            const prev = seenIds.get(idStr);
            if (prev !== undefined) {
                issues.push({ severity: 'error', where: path, label, stationId: idStr, stationName: isNonEmptyString(name) ? name.trim() : '', field: 'id', message: `doppelte id (${idStr}), schon bei stations[${prev}]` });
            } else {
                seenIds.set(idStr, idx);
            }
        }

        if (!isNonEmptyString(s?.name)) {
            issues.push({ severity: 'error', where: path, label, stationId: idStr || null, stationName: '', field: 'name', message: 'Name fehlt/leer' });
        }

        const lat = toNumber(s?.lat);
        const lng = toNumber(s?.lng);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            issues.push({ severity: 'error', where: path, label, stationId: idStr || null, stationName: isNonEmptyString(name) ? name.trim() : '', field: 'lat', message: `ungültig (${s?.lat})` });
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
            issues.push({ severity: 'error', where: path, label, stationId: idStr || null, stationName: isNonEmptyString(name) ? name.trim() : '', field: 'lng', message: `ungültig (${s?.lng})` });
        }

        if (!Array.isArray(s?.tags)) {
            issues.push({ severity: 'warn', where: path, label, stationId: idStr || null, stationName: isNonEmptyString(name) ? name.trim() : '', field: 'tags', message: 'tags ist kein Array (Filter könnten nicht funktionieren)' });
        }

        if (!isNonEmptyString(s?.desc)) {
            issues.push({ severity: 'warn', where: path, label, stationId: idStr || null, stationName: isNonEmptyString(name) ? name.trim() : '', field: 'desc', message: 'Adresse/Ort fehlt' });
        }
        if (!isNonEmptyString(s?.offer)) {
            issues.push({ severity: 'warn', where: path, label, stationId: idStr || null, stationName: isNonEmptyString(name) ? name.trim() : '', field: 'offer', message: 'Angebot/Beschreibung fehlt' });
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
        const label = idStr ? `Event ${idStr}${isNonEmptyString(e?.title) ? ` (${String(e.title).trim()})` : ''}` : `Event (ohne id)`;
        if (!idStr) {
            issues.push({ severity: 'error', where: path, label, eventId: null, field: 'id', message: 'id fehlt' });
        } else {
            const prev = seenIds.get(idStr);
            if (prev !== undefined) {
                issues.push({ severity: 'error', where: path, label, eventId: idStr, field: 'id', message: `doppelte id (${idStr}), schon bei events[${prev}]` });
            } else {
                seenIds.set(idStr, idx);
            }
        }

        if (!isNonEmptyString(e?.time)) {
            issues.push({ severity: 'error', where: path, label, eventId: idStr || null, field: 'time', message: 'Zeit fehlt' });
        }
        if (!isNonEmptyString(e?.title)) {
            issues.push({ severity: 'error', where: path, label, eventId: idStr || null, field: 'title', message: 'Titel fehlt' });
        }

        // Coordinates are optional for events, but if provided they must be valid.
        const hasLat = e?.lat !== undefined && e?.lat !== null && String(e?.lat).trim() !== '';
        const hasLng = e?.lng !== undefined && e?.lng !== null && String(e?.lng).trim() !== '';
        if (hasLat || hasLng) {
            const lat = toNumber(e?.lat);
            const lng = toNumber(e?.lng);
            if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                issues.push({ severity: 'warn', where: path, label, eventId: idStr || null, field: 'lat', message: `ungültig (${e?.lat})` });
            }
            if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
                issues.push({ severity: 'warn', where: path, label, eventId: idStr || null, field: 'lng', message: `ungültig (${e?.lng})` });
            }
        }
    });

    return issues;
}
