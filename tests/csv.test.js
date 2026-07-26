import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, toCsv } from '../js/csv.js';

test('parseCsv detects semicolon separated files', () => {
    const rows = parseCsv('id;name;address;offer\n1;Museum;Straße 1;Genussgalerie, Cocktails\n');

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, '1');
    assert.equal(rows[0].name, 'Museum');
    assert.equal(rows[0].offer, 'Genussgalerie, Cocktails');
});

test('parseCsv keeps quoted commas inside semicolon CSV cells', () => {
    const rows = parseCsv('id;image;likes\n1;"data:image/jpeg;base64,abc,def";0\n');

    assert.equal(rows[0].image, 'data:image/jpeg;base64,abc,def');
    assert.equal(rows[0].likes, '0');
});

test('parseCsv detects comma separated files', () => {
    const rows = parseCsv('id,name,address\n2,Station,Marktplatz\n');

    assert.equal(rows[0].name, 'Station');
    assert.equal(rows[0].address, 'Marktplatz');
});

test('toCsv supports custom semicolon delimiter', () => {
    const csv = toCsv([{ id: 1, offer: 'A;B' }], ['id', 'offer'], ';');

    assert.equal(csv, 'id;offer\n1;"A;B"\n');
});
