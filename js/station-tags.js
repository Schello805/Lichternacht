const aliases = {
    essen: 'food', getränke: 'drink', kinder: 'kids', einkaufen: 'shop', kultur: 'culture'
};

export function normalizeStationTag(value) {
    const tag = String(value ?? '').trim().toLowerCase();
    return aliases[tag] || tag;
}

export function getStationTags(station) {
    const tags = Array.isArray(station?.tags) ? station.tags : [];
    return [...new Set(tags.map(normalizeStationTag).filter(Boolean))];
}
