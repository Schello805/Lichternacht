export function toCsv(rows, headers) {
    const escapeCell = (value) => {
        const s = value === null || value === undefined ? '' : String(value);
        if (/[",\n\r]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const out = [];
    out.push(headers.map(escapeCell).join(','));
    for (const row of rows) {
        out.push(headers.map(h => escapeCell(row[h])).join(','));
    }
    return out.join('\n') + '\n';
}

export function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    const pushCell = () => {
        row.push(cell);
        cell = '';
    };
    const pushRow = () => {
        // Ignore trailing empty row
        const isAllEmpty = row.length === 1 && row[0] === '';
        if (!isAllEmpty) rows.push(row);
        row = [];
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                const next = text[i + 1];
                if (next === '"') {
                    cell += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            continue;
        }

        if (ch === ',') {
            pushCell();
            continue;
        }

        if (ch === '\n') {
            pushCell();
            pushRow();
            continue;
        }

        if (ch === '\r') {
            // ignore, handle CRLF via \n
            continue;
        }

        cell += ch;
    }

    // last cell/row
    pushCell();
    if (row.length > 0) pushRow();

    if (rows.length === 0) return [];

    const headers = rows[0].map(h => (h || '').trim());
    const out = [];
    for (let r = 1; r < rows.length; r++) {
        const obj = {};
        for (let c = 0; c < headers.length; c++) {
            const key = headers[c];
            if (!key) continue;
            obj[key] = rows[r][c] ?? '';
        }
        out.push(obj);
    }
    return out;
}

