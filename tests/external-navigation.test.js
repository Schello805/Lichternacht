import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleNavigationUrl } from '../js/external-navigation.js';

test('external navigation requests native walking guidance without freezing a stale GPS origin', () => {
    const url = new URL(buildGoogleNavigationUrl('49.15', '10.55'));
    assert.equal(url.searchParams.get('destination'), '49.15,10.55');
    assert.equal(url.searchParams.get('travelmode'), 'walking');
    assert.equal(url.searchParams.get('dir_action'), 'navigate');
    assert.equal(url.searchParams.has('origin'), false);
    assert.equal(new URL(buildGoogleNavigationUrl(49, 10, 'driving')).searchParams.get('travelmode'), 'driving');
    for (const pair of [[null, 10], ['', 10], [91, 10], [49, Infinity], [NaN, 10]]) assert.equal(buildGoogleNavigationUrl(...pair), null);
});
