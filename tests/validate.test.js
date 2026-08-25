import test from 'node:test';
import assert from 'node:assert/strict';

import { validateEvents, validateStations } from '../js/validate.js';

test('validateStations warns for missing fields and station advertising limits', () => {
    const issues = validateStations([{
        id: 28,
        name: 'Schützenhaus',
        desc: '',
        offer: 'x'.repeat(251),
        lat: 49.1,
        lng: 10.5,
        tags: ['Essen', 'Getränke', 'Kultur', 'Event', 'Kinder', 'Party']
    }]);

    assert.ok(issues.some(issue => issue.field === 'desc' && issue.severity === 'warn'));
    assert.ok(issues.some(issue => issue.field === 'offer' && issue.message.includes('251/250')));
    assert.ok(issues.some(issue => issue.field === 'tags' && issue.message.includes('6/5')));
});

test('validateStations reports invalid coordinates and duplicate ids', () => {
    const issues = validateStations([
        { id: 1, name: 'A', desc: 'Ort', offer: 'Text', lat: 99, lng: 10, tags: [] },
        { id: 1, name: 'B', desc: 'Ort', offer: 'Text', lat: 49, lng: 181, tags: [] }
    ]);

    assert.ok(issues.some(issue => issue.field === 'id' && issue.severity === 'error'));
    assert.ok(issues.some(issue => issue.field === 'lat' && issue.severity === 'error'));
    assert.ok(issues.some(issue => issue.field === 'lng' && issue.severity === 'error'));
});

test('validateStations requires station names with at least three chars', () => {
    const issues = validateStations([
        { id: 2, name: 'AB', desc: 'Ort', offer: 'Text', lat: 49, lng: 10, tags: [] }
    ]);

    assert.ok(issues.some(issue => issue.field === 'name' && issue.message.includes('mind. 3')));
});

test('validateStations requires numeric station ids', () => {
    const issues = validateStations([
        { id: '28a', name: 'Station', desc: 'Ort', offer: 'Text', lat: 49, lng: 10, tags: [] }
    ]);

    assert.ok(issues.some(issue => issue.field === 'id' && issue.message.includes('Zahl')));
});

test('validateStations rejects zero ids and detects numerically identical ids', () => {
    const issues = validateStations([
        { id: 0, name: 'Nullstation', desc: 'Ort', offer: 'Text', lat: 49, lng: 10, tags: [] },
        { id: '01', name: 'Station Eins', desc: 'Ort', offer: 'Text', lat: 49, lng: 10, tags: [] },
        { id: 1, name: 'Station Eins Neu', desc: 'Ort', offer: 'Text', lat: 49, lng: 10, tags: [] }
    ]);

    assert.ok(issues.some(issue => issue.field === 'id' && issue.message.includes('positive')));
    assert.ok(issues.some(issue => issue.field === 'id' && issue.message.includes('doppelte')));
});

test('validateStations warns for invalid optional links', () => {
    const issues = validateStations([
        { id: 3, name: 'Station', desc: 'Ort', offer: 'Text', link: 'javascript:alert(1)', lat: 49, lng: 10, tags: [] }
    ]);

    assert.ok(issues.some(issue => issue.field === 'link'));
});

test('validateStations checks images, likes, duplicate tags and empty coordinates', () => {
    const issues = validateStations([{
        id: 3,
        name: 'Station',
        desc: 'Ort',
        offer: 'Text',
        image: 'javascript:alert(1)',
        likes: -1,
        lat: 0,
        lng: 0,
        tags: ['Essen', 'essen']
    }]);

    assert.ok(issues.some(issue => issue.field === 'image'));
    assert.ok(issues.some(issue => issue.field === 'likes'));
    assert.ok(issues.some(issue => issue.field === 'tags' && issue.message.includes('doppelte')));
    assert.ok(issues.some(issue => issue.field === 'lat/lng'));
});

test('validateEvents requires time and title', () => {
    const issues = validateEvents([{ id: 'evt-1', time: '', title: '' }]);

    assert.ok(issues.some(issue => issue.field === 'time' && issue.severity === 'error'));
    assert.ok(issues.some(issue => issue.field === 'title' && issue.severity === 'error'));
});

test('validateEvents warns for invalid optional links', () => {
    const issues = validateEvents([{ id: 'evt-1', time: '18:00', title: 'Show', link: 'ftp://example.test' }]);

    assert.ok(issues.some(issue => issue.field === 'link'));
});

test('validateEvents checks time, location, color and map position', () => {
    const issues = validateEvents([{
        id: 'evt-1',
        time: '27:90',
        title: 'Show',
        loc: '',
        color: 'orange',
        lat: 0,
        lng: 0
    }]);

    assert.ok(issues.some(issue => issue.field === 'time' && issue.severity === 'error'));
    assert.ok(issues.some(issue => issue.field === 'loc'));
    assert.ok(issues.some(issue => issue.field === 'color'));
    assert.ok(issues.some(issue => issue.field === 'lat/lng'));
});
