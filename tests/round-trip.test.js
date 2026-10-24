import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildRoundTrip, stationCoordinates, distanceMeters, hasNavigationFix, canConfirmTarget } from '../js/round-trip.js';

const stations = [{ id: 1, lat: 49, lng: 10 }, { id: 2, lat: 49.001, lng: 10.001 }, { id: 3, lat: 49.002, lng: 10 }];
const length = route => route.coordinates.slice(1).reduce((total, coordinate, index) => total + distanceMeters(route.coordinates[index], coordinate), 0);

test('coordinate validation rejects missing, blank, nonfinite and out-of-range values', () => {
    for (const value of [null, undefined, '', ' ', true, NaN, Infinity, 'invalid']) {
        assert.equal(stationCoordinates({ lat: value, lng: 10 }), null);
        assert.equal(stationCoordinates({ lat: 49, lng: value }), null);
    }
    assert.equal(stationCoordinates({ lat: 91, lng: 10 }), null);
    assert.equal(stationCoordinates({ lat: 49, lng: -181 }), null);
    assert.deepEqual(stationCoordinates({ lat: '0', lng: '180' }), [180, 0]);
});

test('planning needs no GPS, filters invalid stations and closes the loop without mutating inputs', () => {
    const input = [...stations, { id: 4, lat: null, lng: 10 }];
    const original = structuredClone(input);
    const route = buildRoundTrip(input, ['1', 2, '4']);
    assert.deepEqual(route.stations.map(station => station.id), [1, 2]);
    assert.deepEqual(route.coordinates[0], route.coordinates.at(-1));
    assert.deepEqual(input, original);
    assert.deepEqual(buildRoundTrip(input, []), { coordinates: [], stations: [] });
    assert.equal(buildRoundTrip(input, [1]).stations.length, 0);
});

test('bounded 2-opt is deterministic, preserves every stop and never worsens nearest-neighbor', () => {
    let seed = 17;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let improved = false;
    for (let sample = 0; sample < 20; sample += 1) {
        const input = Array.from({ length: 15 }, (_, index) => ({ id: index + 1, lat: 49 + random() / 10, lng: 10 + random() / 10 }));
        const greedy = buildRoundTrip(input, null, 0);
        const optimized = buildRoundTrip(input);
        assert.ok(length(optimized) <= length(greedy) + 0.001);
        improved ||= length(optimized) < length(greedy) - 0.01;
        assert.deepEqual(optimized, buildRoundTrip(input));
        assert.equal(new Set(optimized.stations.map(station => station.id)).size, input.length);
        assert.equal(optimized.stations[0].id, 1);
        assert.ok(length(buildRoundTrip(input, null, 1)) <= length(greedy) + 0.001);
    }
    assert.ok(improved);
});

test('GPS confirmation requires a recent accurate fix and proximity', () => {
    const now = 100000;
    const state = { userLocation: stations[0], gpsAccuracy: 10, gpsLastFixAt: now };
    assert.ok(canConfirmTarget(state, stations[0], now));
    assert.equal(canConfirmTarget(state, { lat: 50, lng: 10 }, now), false);
    for (const patch of [{ gpsAccuracy: null }, { gpsAccuracy: 51 }, { gpsAccuracy: -1 }, { gpsLastFixAt: now - 15001 }, { gpsLastFixAt: now + 1 }, { userLocation: null }]) {
        assert.equal(hasNavigationFix({ ...state, ...patch }, now), false);
    }
    assert.ok(hasNavigationFix({ ...state, gpsAccuracy: 50, gpsLastFixAt: now - 15000 }, now));
    assert.equal(distanceMeters([0, 0], [0, 0]), 0);
    assert.ok(Number.isFinite(distanceMeters([0, 0], [180, 0])));
});

async function navigationHarness() {
    const source = await readFile(new URL('../js/maplibre-map.js', import.meta.url), 'utf8');
    const state = { overviewRouteStations: stations, overviewRouteGeometry: {}, overviewRouteRequestId: 1, overviewRouteNavigationIndex: 0,
        overviewRouteNavigationProgress: 0, overviewRouteNavigationActive: false, overviewRouteReached: 0, overviewRouteSkipped: 0,
        userLocation: stations[0], gpsAccuracy: 10, gpsLastFixAt: Date.now() };
    const context = vm.createContext({ state, hasNavigationFix, canConfirmTarget, getValidCoordinates: (lat, lng) => ({ latitude: lat, longitude: lng }),
        getDistanceMeters: distanceMeters, showToast() {}, updateOverviewRouteNavigationButton() {}, locateUser() {}, localStorage: { getItem() { return null; } },
        GPS_AUTO_RESUME_STORAGE_KEY: '', GPS_AUTO_RESUME_INTENT_STORAGE_KEY: '' });
    const navigation = source.slice(source.indexOf('export function startOverviewNavigation()'), source.indexOf('export async function toggleOverviewRoute'));
    vm.runInContext(navigation.replaceAll('export function', 'function'), context);
    return { state, context };
}

test('GPS updates never advance stops; manual confirmations count one stop and require loop closure', async () => {
    const { state, context } = await navigationHarness();
    context.startOverviewNavigation();
    assert.equal(state.overviewRouteNavigationActive, true);
    for (let index = 0; index < 5; index += 1) context.advanceOverviewNavigationIfReached(49, 10);
    assert.equal(state.overviewRouteNavigationProgress, 0);
    context.startOverviewNavigation();
    assert.equal(state.overviewRouteReached, 1);
    state.gpsLastFixAt = 1;
    context.startOverviewNavigation();
    assert.equal(state.overviewRouteNavigationProgress, 1);
    context.skipOverviewNavigationStation();
    context.skipOverviewNavigationStation();
    assert.equal(state.overviewRouteSkipped, 2);
    assert.equal(state.overviewRouteClosing, true);
    assert.equal(state.overviewRouteNavigationActive, true);
    context.skipOverviewNavigationStation();
    assert.equal(state.overviewRouteSkipped, 2);
    state.gpsLastFixAt = Date.now();
    context.startOverviewNavigation();
    assert.equal(state.overviewRouteCompleted, true);
    assert.equal(state.overviewRouteNavigationActive, false);
});

test('estimated routes and missing or inaccurate GPS cannot start navigation', async () => {
    for (const patch of [{ overviewRouteEstimated: true }, { gpsAccuracy: 100 }, { userLocation: null }, { overviewRouteCalculating: true }]) {
        const { state, context } = await navigationHarness();
        Object.assign(state, patch);
        context.startOverviewNavigation();
        assert.equal(state.overviewRouteNavigationActive, false);
    }
});

test('clearing a calculation without geometry invalidates late responses and GPS callbacks', async () => {
    const source = await readFile(new URL('../js/maplibre-map.js', import.meta.url), 'utf8');
    const state = { stations, overviewRouteRequestId: 0, overviewRouteMarkers: [], overviewRouteStations: [] };
    const responses = [];
    const context = vm.createContext({ state, buildRoundTrip, hasNavigationFix, canConfirmTarget, AbortController,
        document: { getElementById() { return null; } }, window: { setTimeout, clearTimeout }, console: { warn() {} },
        fetch: () => new Promise(resolve => responses.push(resolve)),
        showToast() {}, setRouteInfo() {}, hideRouteInfoIfUnused() {}, updateOverviewRouteButton() {},
        renderOverviewRoute() {}, fitCoordinates() {}, setGeoJsonLayer() {}, getDistanceMeters: distanceMeters,
        clearRoute() { context.clearOverviewRoute(); } });
    const routeCode = source.slice(source.indexOf('function buildOverviewRoundTrip('), source.indexOf('export function resetMap()'));
    vm.runInContext(routeCode.replaceAll('export async function', 'async function').replaceAll('export function', 'function'), context);
    const pending = context.toggleOverviewRoute([1, 2]);
    assert.equal(state.overviewRouteCalculating, true);
    assert.equal(state.overviewRouteGeometry, null);
    await context.toggleOverviewRoute();
    assert.equal(state.overviewRouteCalculating, false);
    responses[0]({ ok: true, json: async () => ({ routes: [{ geometry: { type: 'LineString', coordinates: [[10, 49], [10.001, 49.001]] }, distance: 100, duration: 80 }] }) });
    await pending;
    assert.equal(state.overviewRouteGeometry, null);
    assert.equal(state.overviewRouteStations.length, 0);
});

test('a replacement calculation owns the result even when earlier fetch resolves last', async () => {
    const source = await readFile(new URL('../js/maplibre-map.js', import.meta.url), 'utf8');
    const state = { stations, overviewRouteRequestId: 0, overviewRouteMarkers: [], overviewRouteStations: [] };
    const responses = [];
    const context = vm.createContext({ state, buildRoundTrip, AbortController,
        document: { getElementById() { return null; } }, window: { setTimeout, clearTimeout }, console: { warn() {} },
        fetch: () => new Promise(resolve => responses.push(resolve)),
        showToast() {}, setRouteInfo() {}, hideRouteInfoIfUnused() {}, updateOverviewRouteButton() {},
        fitCoordinates() {}, setGeoJsonLayer() {}, getDistanceMeters: distanceMeters,
        clearRoute() { context.clearOverviewRoute(); }, OVERVIEW_ROUTE_SOURCE_ID: 'route', OVERVIEW_ROUTE_LAYER_ID: 'line' });
    const routeCode = source.slice(source.indexOf('function buildOverviewRoundTrip('), source.indexOf('export function resetMap()'));
    vm.runInContext(routeCode.replaceAll('export async function', 'async function').replaceAll('export function', 'function'), context);
    const first = context.toggleOverviewRoute([1, 2]);
    const second = context.toggleOverviewRoute([2, 3]);
    const response = { ok: false };
    responses[1](response);
    await second;
    assert.equal(state.overviewRouteEstimated, true);
    assert.equal(state.overviewRouteCalculating, false);
    assert.deepEqual(Array.from(state.overviewRouteStations, station => station.id), [2, 3]);
    responses[0](response);
    await first;
    assert.deepEqual(Array.from(state.overviewRouteStations, station => station.id), [2, 3]);
    assert.match(state.overviewRouteSummary, /reine Gehzeit/);
});
