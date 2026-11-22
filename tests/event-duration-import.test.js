import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { validateEvents } from '../js/validate.js';
import { parseLocalizedNumber } from '../js/csv.js';

test('table imports preserve legacy durations, allow clearing and reject invalid explicit durations', async () => {
    const source = await readFile(new URL('../js/admin.js', import.meta.url), 'utf8');
    const context = vm.createContext({ state: { events: [{ id: 'show', durationMinutes: 60 }], stations: [] }, validateEvents, parseLocalizedNumber, normalizeImportedUrl: value => value || '' });
    vm.runInContext(source.match(/const EVENT_TABLE_COLUMNS = .*;/)[0] + '\n' + source.slice(source.indexOf('async function importRowsGeneric('), source.indexOf('function getGoogleSheetId(')), context);
    const row = { id: 'show', time: '18:00', title: 'Eine Show', description: '', link: '', image: '', loc: 'Platz', stationId: '', lat: '49', lng: '10', color: 'yellow' };
    const load = input => context.importRowsGeneric([input], 'events', { dryRun: true });
    assert.equal((await load(row)).mapped[0].durationMinutes, 60);
    assert.equal((await load({ ...row, durationMinutes: '' })).mapped[0].durationMinutes, undefined);
    assert.equal((await load({ ...row, durationMinutes: '45' })).mapped[0].durationMinutes, 45);
    for (const durationMinutes of ['nichts', '-1', '0', '2,5', '1441']) await assert.rejects(load({ ...row, durationMinutes }), /Dauer/);
});
