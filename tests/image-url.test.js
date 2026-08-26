import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImageUrl } from '../js/image-url.js';

test('normalizes server image paths against the app origin', () => {
    assert.equal(
        normalizeImageUrl('/downloads/events/e3.webp', 'https://lichternacht-bechhofen.de'),
        'https://lichternacht-bechhofen.de/downloads/events/e3.webp'
    );
});

test('keeps external and supported inline images', () => {
    assert.equal(normalizeImageUrl('https://cdn.example/image.webp'), 'https://cdn.example/image.webp');
    assert.equal(normalizeImageUrl('data:image/webp;base64,AAAA'), 'data:image/webp;base64,AAAA');
});

test('rejects unsafe image protocols', () => {
    assert.equal(normalizeImageUrl('javascript:alert(1)'), '');
});
