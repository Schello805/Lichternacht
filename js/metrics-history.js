export function metricsChart(history) {
    const width = 720;
    const height = 240;
    const left = 40;
    const top = 15;
    const plotWidth = 660;
    const plotHeight = 190;
    const start = Number(history.start);
    const end = Number(history.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
    const samples = (history.samples || []).filter(sample => Number.isFinite(sample.timestamp) && sample.timestamp >= start && sample.timestamp < end);
    const paths = (field, color) => {
        const segments = [];
        let points = [];
        let previous = null;
        const flush = () => { if (points.length) segments.push(points); points = []; };
        for (const sample of samples) {
            const value = sample[field];
            if (!Number.isFinite(value) || value < 0 || value > 100) { flush(); previous = null; continue; }
            if (previous !== null && sample.timestamp - previous > 90000) flush();
            points.push([left + (sample.timestamp - start) / (end - start) * plotWidth, top + (100 - value) / 100 * plotHeight]);
            previous = sample.timestamp;
        }
        flush();
        return segments.map(segment => segment.length === 1
            ? `<circle cx="${segment[0][0]}" cy="${segment[0][1]}" r="2" fill="${color}"/>`
            : `<polyline points="${segment.map(point => point.join(',')).join(' ')}" stroke="${color}" fill="none" stroke-width="2"/>`).join('');
    };
    const grid = [0, 50, 100].map(value => `<line x1="${left}" x2="700" y1="${top + (100 - value) / 100 * plotHeight}" y2="${top + (100 - value) / 100 * plotHeight}" stroke="currentColor" opacity="0.15"/><text x="5" y="${top + (100 - value) / 100 * plotHeight + 4}" fill="currentColor" font-size="11">${value}%</text>`).join('');
    const ticks = [0, 3, 6, 9, 12].map(hour => `<text x="${left + hour / 12 * plotWidth}" y="230" text-anchor="middle" fill="currentColor" font-size="11">${new Date(start + hour * 3600000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="CPU- und RAM-Auslastung über zwölf Stunden" class="w-full min-w-[520px]">${grid}${ticks}${paths('cpuPercent', '#d97706')}${paths('memoryPercent', '#2563eb')}</svg>`;
}

export function historySummary(samples) {
    const values = field => samples.map(sample => sample[field]).filter(value => Number.isFinite(value) && value >= 0);
    const cpu = values('cpuPercent');
    const memory = values('memoryPercent');
    const bytes = values('memoryUsed');
    return { cpuMax: cpu.length ? Math.max(...cpu) : null, cpuAverage: cpu.length ? cpu.reduce((sum, value) => sum + value, 0) / cpu.length : null,
        memoryMax: memory.length ? Math.max(...memory) : null, memoryBytesMax: bytes.length ? Math.max(...bytes) : null };
}
