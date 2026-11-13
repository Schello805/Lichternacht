import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { hasNavigationFix, stationCoordinates } from '../js/round-trip.js';

const source = await readFile(new URL('../js/maplibre-map.js', import.meta.url), 'utf8');
const geometry = longitude => ({ type: 'LineString', coordinates: [[10, 49], [longitude, 49.001]] });
const route = longitude => ({ geometry: geometry(longitude), distance: 150, duration: 120 });

function harness(tour = false) {
    const state = { userLocation: { lat: 49, lng: 10 }, gpsAccuracy: 5, gpsLastFixAt: Date.now(), routeRequestId: 0, overviewRouteRequestId: 0, map: null,
        overviewRouteNavigationActive: tour, overviewRouteGeometry: tour ? geometry(10.003) : null, overviewRouteMode: 'round', overviewRouteReached: 1, overviewRouteSkipped: 1,
        overviewRouteNavigationProgress: 2, overviewRouteStations: [{ id: 1 }, { id: 2 }, { id: 3 }], overviewRouteOrigin: { lat: 48.99, lng: 9.99 }, overviewRouteSummary: '500 m' };
    const pending = [];
    const gps = [];
    const storage = new Map(tour ? [['tour', 'saved-progress']] : []);
    const control = { classList: { remove() {} }, setAttribute() {} };
    const ui = {};
    let resumed = 0;
    const context = vm.createContext({ state, hasNavigationFix, AbortController, console,
        window: { clearTimeout() {} }, document: { getElementById: () => control }, localStorage: {},
        getValidCoordinates: (lat, lng) => stationCoordinates({ lat, lng }) ? { latitude: lat, longitude: lng } : null,
        locateUser: callback => gps.push(callback), fetchFootRoute: (coordinates, signal) => new Promise((resolve, reject) => pending.push({ coordinates, signal, resolve, reject })),
        saveTour() {}, dismissSavedTour: () => storage.delete('tour'), clearOverviewApproach() {}, updateOverviewRouteButton() {},
        hideRouteInfoIfUnused() {}, showToast() {}, renderRoute() {}, fitCoordinates() {},
        setRouteInfo: (title, detail) => Object.assign(ui, { title, detail }), updateOverviewRouteNavigationButton: () => resumed++,
        formatRouteDistance: String, formatRouteDuration: String });
    const install = text => vm.runInContext(text.replaceAll('export async function', 'async function').replaceAll('export function', 'function'), context);
    install(source.slice(source.indexOf('function clearSingleRoute()'), source.indexOf('function setRouteInfo(')));
    install(source.slice(source.indexOf('function clearOverviewRoute()'), source.indexOf('function renderOverviewRoute(')));
    return { state, pending, gps, storage, context, ui, get resumed() { return resumed; } };
}

test('WC detour preserves the entire tour and resumes at the same stop even after routing fails', async () => {
    for (const failure of [false, true]) {
        const setup = harness(true);
        const before = JSON.stringify({ origin: setup.state.overviewRouteOrigin, stations: setup.state.overviewRouteStations });
        const request = setup.context.routeToRestroom(49.001, 10.001);
        assert.equal(setup.state.overviewRoutePaused, true);
        assert.equal(setup.storage.get('tour'), 'saved-progress');
        assert.equal(setup.state.overviewRouteNavigationProgress, 2);
        if (failure) setup.pending[0].reject(new Error('unavailable'));
        else setup.pending[0].resolve(route(10.001));
        await request;
        assert.equal(setup.ui.title, failure ? 'Kein Fußweg verfügbar' : 'Fußweg zum WC');
        setup.context.clearRoute();
        assert.equal(setup.state.overviewRoutePaused, false);
        assert.equal(setup.state.overviewRouteNavigationProgress, 2);
        assert.equal(setup.state.overviewRouteReached, 1);
        assert.equal(setup.state.overviewRouteSkipped, 1);
        assert.equal(setup.storage.get('tour'), 'saved-progress');
        assert.equal(JSON.stringify({ origin: setup.state.overviewRouteOrigin, stations: setup.state.overviewRouteStations }), before);
        assert.equal(setup.resumed, 1);
    }
});

test('cancelled or superseded walking responses never redraw routes or overwrite the target', async () => {
    const setup = harness();
    const first = setup.context.calculateRoute(49.001, 10.001);
    const second = setup.context.calculateRoute(49.002, 10.002);
    assert.equal(setup.pending[0].signal.aborted, true);
    setup.pending[1].resolve(route(10.002));
    await second;
    setup.pending[0].resolve(route(10.001));
    await first;
    assert.deepEqual(JSON.parse(JSON.stringify(setup.state.routeGeometry)), geometry(10.002));
    const third = setup.context.calculateRoute(49.003, 10.003);
    setup.context.clearRoute();
    setup.pending[2].resolve(route(10.003));
    await third;
    assert.equal(setup.state.routeGeometry, null);
    assert.equal(setup.pending[2].signal.aborted, true);
});

test('station routes require fresh GPS and a cancelled GPS callback cannot start routing', async () => {
    const setup = harness();
    setup.state.gpsLastFixAt = Date.now() - 60000;
    await setup.context.calculateRoute(49.001, 10.001);
    assert.equal(setup.pending.length, 0);
    assert.equal(setup.gps.length, 1);
    setup.context.clearRoute();
    setup.state.gpsLastFixAt = Date.now();
    await setup.gps[0]();
    assert.equal(setup.pending.length, 0);
    setup.state.gpsLastFixAt = Date.now() - 60000;
    await setup.context.calculateRoute(49.001, 10.001);
    setup.state.gpsLastFixAt = Date.now();
    const result = setup.gps[1]();
    assert.deepEqual(JSON.parse(JSON.stringify(setup.pending[0].coordinates)), [[10, 49], [10.001, 49.001]]);
    setup.pending[0].resolve(route(10.001));
    await result;
    assert.equal(setup.ui.title, 'Fußweg zur Station');
});

test('starting a single foot route invalidates an unfinished tour calculation', async () => {
    const setup = harness();
    const controller = new AbortController();
    setup.state.overviewRouteController = controller;
    setup.state.overviewRouteCalculating = true;
    const previousRequest = setup.state.overviewRouteRequestId;
    const result = setup.context.calculateRoute(49.001, 10.001);
    assert.equal(controller.signal.aborted, true);
    assert.equal(setup.state.overviewRouteCalculating, false);
    assert.ok(setup.state.overviewRouteRequestId > previousRequest);
    setup.pending[0].resolve(route(10.001));
    await result;
});
