import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';

test('category survives searches, data refreshes and GPS redraws', async () => {
    const container = { innerHTML: '', scrollTo() {} };
    globalThis.window = {};
    globalThis.document = { getElementById: id => id === 'stations-list' ? container : null };
    globalThis.localStorage = { getItem: () => null };
    state.stations = [
        { id: 1, name: 'Mit Toilette', offer: 'Kaffee', tags: [' WC '] },
        { id: 2, name: 'Ohne Toilette', offer: 'Kaffee', tags: ['food'] }
    ];
    state.favorites = new Set();
    state.events = [];
    state.userLocation = null;
    const { filterList, filterStations, renderList, refreshStationList } = await import('../js/ui.js');
    filterList('wc');
    filterStations('Kaffee');
    assert.match(container.innerHTML, /Mit Toilette/);
    assert.doesNotMatch(container.innerHTML, /Ohne Toilette/);
    renderList(state.stations);
    assert.doesNotMatch(container.innerHTML, /Ohne Toilette/);
    filterStations('Unbekannt');
    refreshStationList();
    assert.match(container.innerHTML, /Keine passenden Stationen/);
});
