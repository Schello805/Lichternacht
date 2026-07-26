export function toCsv(rows, headers, delimiter = ',') {
    const escapeCell = (value) => {
        const s = value === null || value === undefined ? '' : String(value);
        const mustQuote = s.includes(delimiter) || /["\n\r]/.test(s);
        if (mustQuote) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const out = [];
    out.push(headers.map(escapeCell).join(delimiter));
    for (const row of rows) {
        out.push(headers.map(h => escapeCell(row[h])).join(delimiter));
    }
    return out.join('\n') + '\n';
}

function detectDelimiter(headerLine) {
    const candidates = [',', ';', '\t'];
    const counts = Object.fromEntries(candidates.map(candidate => [candidate, 0]));
    let inQuotes = false;

    for (let i = 0; i < headerLine.length; i++) {
        const ch = headerLine[i];
        if (ch === '"') {
            if (inQuotes && headerLine[i + 1] === '"') {
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (!inQuotes && counts[ch] !== undefined) counts[ch] += 1;
    }

    return candidates.sort((a, b) => counts[b] - counts[a])[0] || ',';
}

export function parseCsv(text) {
    const normalizedText = String(text || '').replace(/^\uFEFF/, '');
    const firstLine = normalizedText.split(/\r?\n/, 1)[0] || '';
    const delimiter = detectDelimiter(firstLine);
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

    for (let i = 0; i < normalizedText.length; i++) {
        const ch = normalizedText[i];

        if (inQuotes) {
            if (ch === '"') {
                const next = normalizedText[i + 1];
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

        if (ch === delimiter) {
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

    const headers = rows[0].map(h => (h || '').trim().replace(/^\uFEFF/, ''));
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
