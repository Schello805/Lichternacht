import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildRoundTrip, stationCoordinates, distanceMeters, hasNavigationFix, canConfirmTarget, targetDistanceLabel, STATION_ARRIVAL_RADIUS_METERS } from '../js/round-trip.js';

const stations = [{ id: 1, lat: 49, lng: 10 }, { id: 2, lat: 49.001, lng: 10.001 }, { id: 3, lat: 49.002, lng: 10 }];
const length = route => route.coordinates.slice(1).reduce((total, coordinate, index) => total + distanceMeters(route.coordinates[index], coordinate), 0);

test('arrival uses the shared 20 meter radius, not the previous 25 or 65 meters', () => {
    assert.equal(STATION_ARRIVAL_RADIUS_METERS, 20);
    const now = 100000;
    const state = { userLocation: { lat: 0, lng: 0 }, gpsAccuracy: 5, gpsLastFixAt: now };
    for (const meters of [0, 19.99, 20.01, 25, 65]) {
        const target = { lat: meters / 6371000 * 180 / Math.PI, lng: 0 };
        assert.equal(canConfirmTarget(state, target, now), meters <= 20);
    }
});

test('target distance explicitly labels straight line and never presents stale GPS as current', () => {
    const now = 100000;
    const state = { userLocation: stations[0], gpsAccuracy: 12.1, gpsLastFixAt: now };
    assert.match(targetDistanceLabel(state, stations[1], now), /ca\. 133 m Luftlinie \(GPS ±13 m\)/);
    assert.match(targetDistanceLabel(state, stations[1], now + 15001), /GPS erforderlich/);
    assert.match(targetDistanceLabel({ ...state, gpsAccuracy: 51 }, stations[1], now), /GPS erforderlich/);
    assert.match(targetDistanceLabel(state, { lat: null }, now), /nicht verfügbar/);
    assert.match(targetDistanceLabel(state, { lat: 50, lng: 10 }, now), /km Luftlinie/);
});

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
        toggleOverviewRoute() { if (hasNavigationFix(state)) { state.overviewRouteNavigationActive = true; state.overviewRouteOrigin = { ...state.userLocation }; } },
        getDistanceMeters: distanceMeters, showToast() {}, updateOverviewRouteNavigationButton() {}, locateUser() {}, localStorage: { getItem() { return null; } },
        GPS_AUTO_RESUME_STORAGE_KEY: '', GPS_AUTO_RESUME_INTENT_STORAGE_KEY: '' });
    const navigation = source.slice(source.indexOf('export function startOverviewNavigation()'), source.indexOf('export async function toggleOverviewRoute'));
    vm.runInContext(navigation.replaceAll('export function', 'function'), context);
    return { state, context };
}

test('route controls distinguish distance, arrival and expired GPS without advancing automatically', async () => {
    const source = await readFile(new URL('../js/maplibre-map.js', import.meta.url), 'utf8');
    const elements = Object.fromEntries(['overview-route-navigation-btn', 'overview-route-skip-btn', 'route-info-detail'].map(id => [id, { classList: { toggle() {}, remove() {} } }]));
    const state = { overviewRouteGeometry: {}, overviewRouteStations: stations.map(station => ({ ...station, name: '<img src=x onerror=alert(1)>' })), overviewRouteNavigationIndex: 0,
        overviewRouteNavigationActive: true, overviewRouteSummary: 'Gesamte Runde: 442 m', overviewRouteReached: 0, overviewRouteSkipped: 0,
        userLocation: { lat: 50, lng: 10 }, gpsAccuracy: 10, gpsLastFixAt: Date.now() };
    let scheduled;
    const context = vm.createContext({ state, canConfirmTarget, hasNavigationFix, targetDistanceLabel, refreshOverviewApproach() {},
        document: { getElementById: id => elements[id] }, window: { clearTimeout() {}, setTimeout(callback) { scheduled = callback; return 1; } } });
    vm.runInContext(source.slice(source.indexOf('function escapeHtml('), source.indexOf('const MAP_STYLES')), context);
    vm.runInContext(source.slice(source.indexOf('function updateOverviewRouteNavigationButton()'), source.indexOf('export function startOverviewNavigation()')), context);
    context.updateOverviewRouteNavigationButton();
    const button = elements['overview-route-navigation-btn'];
    assert.equal(button.disabled, true);
    assert.equal(button.innerHTML, 'Unterwegs');
    assert.match(elements['route-info-detail'].innerHTML, /Gesamte Runde: 442 m/);
    assert.match(elements['route-info-detail'].innerHTML, /km Luftlinie/);
    assert.match(elements['route-info-detail'].innerHTML, /&lt;img/);
    assert.doesNotMatch(elements['route-info-detail'].innerHTML, /<img/);
    state.userLocation = stations[0];
    context.updateOverviewRouteNavigationButton();
    assert.equal(button.disabled, false);
    assert.equal(button.innerHTML, '✓ Weiter');
    state.gpsLastFixAt = Date.now() - 16000;
    scheduled();
    assert.equal(button.disabled, true);
    assert.equal(button.innerHTML, 'GPS abwarten');
    assert.equal(state.overviewRouteReached, 0);
});

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
    const state = { stations, overviewRouteRequestId: 0, overviewRouteMarkers: [], overviewRouteStations: [], userLocation: stations[0], gpsAccuracy: 5, gpsLastFixAt: Date.now() };
    const responses = [];
    const context = vm.createContext({ state, buildRoundTrip, hasNavigationFix, canConfirmTarget, AbortController,
        document: { getElementById() { return null; } }, window: { setTimeout, clearTimeout }, console: { warn() {} },
        planWalkingTour: () => new Promise(resolve => responses.push(resolve)),
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
    responses[0]({ stations, route: { geometry: { type: 'LineString', coordinates: [[10, 49], [10.001, 49.001]] }, distance: 100, duration: 80 } });
    await pending;
    assert.equal(state.overviewRouteGeometry, null);
    assert.equal(state.overviewRouteStations.length, 0);
});

test('failed foot routing never draws straight lines, including late responses', async () => {
    const source = await readFile(new URL('../js/maplibre-map.js', import.meta.url), 'utf8');
    const state = { stations, overviewRouteRequestId: 0, overviewRouteMarkers: [], overviewRouteStations: [], userLocation: stations[0], gpsAccuracy: 5, gpsLastFixAt: Date.now() };
    const responses = [];
    const context = vm.createContext({ state, buildRoundTrip, hasNavigationFix, AbortController,
        document: { getElementById() { return null; } }, window: { setTimeout, clearTimeout }, console: { warn() {} },
        planWalkingTour: () => new Promise(resolve => responses.push(resolve)),
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
    assert.equal(state.overviewRouteGeometry, null);
    assert.equal(state.overviewRouteCalculating, false);
    assert.equal(state.overviewRouteStations.length, 0);
    responses[0](response);
    await first;
    assert.equal(state.overviewRouteStations.length, 0);
    assert.equal(state.overviewRouteGeometry, null);
});

test('GPS is required at start and a cancelled GPS callback cannot start a tour', async () => {
    const source = await readFile(new URL('../js/maplibre-map.js', import.meta.url), 'utf8');
    const state = { stations, overviewRouteRequestId: 0, overviewRouteMarkers: [], overviewRouteStations: [], userLocation: null };
    let gpsCallback;
    let routeCalls = 0;
    const context = vm.createContext({ state, buildRoundTrip, hasNavigationFix, AbortController,
        document: { getElementById() { return null; } }, window: { setTimeout, clearTimeout },
        planWalkingTour() { routeCalls += 1; }, locateUser(callback) { gpsCallback = callback; },
        showToast() {}, setRouteInfo() {}, hideRouteInfoIfUnused() {}, setGeoJsonLayer() {}, updateOverviewRouteButton() {},
        clearRoute() { context.clearOverviewRoute(); } });
    const routeCode = source.slice(source.indexOf('function buildOverviewRoundTrip('), source.indexOf('export function resetMap()'));
    vm.runInContext(routeCode.replaceAll('export async function', 'async function').replaceAll('export function', 'function'), context);
    await context.toggleOverviewRoute([1, 2]);
    assert.equal(routeCalls, 0);
    assert.equal(state.overviewRouteNavigationActive, false);
    context.clearOverviewRoute();
    state.userLocation = stations[0];
    state.gpsAccuracy = 5;
    state.gpsLastFixAt = Date.now();
    gpsCallback();
    assert.equal(routeCalls, 0);
    assert.equal(state.overviewRouteOrigin, null);
});

test('open tour visits every selected station once without a closing segment', () => {
    const input = [{ id: 1, lat: 0, lng: 0.002 }, { id: 2, lat: 0, lng: 0 }, { id: 3, lat: 0, lng: 0.001 }];
    const tour = buildRoundTrip(input, null, 20000, 'open');
    assert.equal(tour.coordinates.length, 3);
    assert.equal(new Set(tour.stations.map(station => station.id)).size, 3);
    assert.ok(length(tour) < length(buildRoundTrip(input)));
    const fromGps = buildRoundTrip(input, null, 20000, 'open', [0, 0]);
    assert.equal(fromGps.stations[0].id, 2);
    assert.deepEqual(fromGps.stations.map(station => station.id), [2, 3, 1]);
});

test('open navigation keeps its planned first stop and ends without returning to start', async () => {
    const { state, context } = await navigationHarness();
    state.overviewRouteMode = 'open';
    state.userLocation = stations[2];
    context.startOverviewNavigation();
    assert.equal(state.overviewRouteNavigationIndex, 0);
    context.skipOverviewNavigationStation();
    context.skipOverviewNavigationStation();
    context.startOverviewNavigation();
    assert.equal(state.overviewRouteCompleted, true);
    assert.equal(state.overviewRouteNavigationActive, false);
    assert.ok(!state.overviewRouteClosing);
    assert.equal(state.overviewRouteReached, 1);
    assert.equal(state.overviewRouteSkipped, 2);
});

test('approach requests are throttled and old target responses cannot overwrite the current leg', async () => {
    const source = await readFile(new URL('../js/maplibre-map.js', import.meta.url), 'utf8');
    const state = { overviewRouteNavigationActive: true, overviewRouteStations: stations, overviewRouteNavigationIndex: 0,
        overviewRouteRequestId: 1, overviewRouteNavigationProgress: 0, userLocation: stations[2], gpsAccuracy: 10, gpsLastFixAt: Date.now() };
    const pending = [];
    const rendered = [];
    const context = vm.createContext({ state, AbortController, hasNavigationFix, getDistanceMeters: distanceMeters,
        fetchFootRoute: (coordinates, signal) => new Promise(resolve => pending.push({ resolve, signal, coordinates })),
        setGeoJsonLayer: (id, layers, feature) => rendered.push(feature.geometry), fitCoordinates() {} });
    vm.runInContext(source.slice(source.indexOf('function renderOverviewApproach('), source.indexOf('function updateOverviewRouteNavigationButton()')), context);
    const first = context.refreshOverviewApproach();
    await context.refreshOverviewApproach();
    assert.equal(pending.length, 1);
    state.overviewRouteNavigationIndex = 1;
    state.overviewRouteNavigationProgress = 1;
    const second = context.refreshOverviewApproach();
    assert.equal(pending[0].signal.aborted, true);
    const geometry = { type: 'LineString', coordinates: [[10, 49], [10.1, 49]] };
    pending[1].resolve({ geometry, distance: 100, duration: 60 });
    await second;
    pending[0].resolve({ geometry: { old: true }, distance: 200, duration: 120 });
    await first;
    assert.deepEqual(rendered, [geometry]);
    assert.equal(state.overviewApproach.route.distance, 100);
    state.gpsLastFixAt = 1;
    state.overviewRouteNavigationIndex = 2;
    state.overviewRouteNavigationProgress = 2;
    await context.refreshOverviewApproach();
    assert.equal(state.overviewApproach, null);
    assert.equal(pending[1].signal.aborted, true);
    assert.equal(pending.length, 2);
    state.overviewRouteNavigationActive = false;
    await context.refreshOverviewApproach();
    assert.equal(state.overviewApproach, null);
});
