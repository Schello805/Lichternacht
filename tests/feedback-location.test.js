import test from 'node:test';
import assert from 'node:assert/strict';
import { getFeedbackLocation } from '../js/feedback-location.js';

test('feedback location uses one position request and includes accuracy and timestamp', async () => {
    let requests = 0;
    const location = await getFeedbackLocation({
        getCurrentPosition(success, failure, options) {
            requests++;
            assert.equal(options.maximumAge, 60000);
            assert.equal(options.timeout, 8000);
            assert.equal(options.enableHighAccuracy, false);
            success({ coords: { latitude: 49.158, longitude: 10.552, accuracy: 12 }, timestamp: 100000 });
        },
        watchPosition() { throw new Error('Feedback must not start location tracking'); }
    });
    assert.equal(requests, 1);
    assert.deepEqual(location, { lat: 49.158, lng: 10.552, accuracy: 12, capturedAt: new Date(100000).toISOString() });
});

test('unsupported, denied and throwing geolocation allow feedback without a location', async () => {
    assert.equal(await getFeedbackLocation(null), null);
    assert.equal(await getFeedbackLocation({ getCurrentPosition(success, failure) { failure({ code: 1 }); } }), null);
    assert.equal(await getFeedbackLocation({ getCurrentPosition() { throw new Error('Unavailable'); } }), null);
});

test('malformed coordinates are never attached to feedback', async () => {
    for (const latitude of [NaN, Infinity, 91, '49.158', null]) {
        assert.equal(await getFeedbackLocation({ getCurrentPosition(success) { success({ coords: { latitude, longitude: 10.552 } }); } }), null);
    }
});
