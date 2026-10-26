import test from 'node:test';
import assert from 'node:assert/strict';
import { preloadImage } from '../js/image-preload.js';

for (const outcome of ['load', 'error']) {
    test(`image preloading settles on ${outcome} without a Fetch API request`, async () => {
        const previousImage = globalThis.Image;
        const previousFetch = globalThis.fetch;
        const images = [];
        globalThis.fetch = () => { throw new Error('Unexpected Fetch API request'); };
        globalThis.Image = class {
            constructor() { images.push(this); }
            set src(value) {
                this.url = value;
                queueMicrotask(() => this[`on${outcome}`]());
            }
        };
        try {
            await preloadImage('/downloads/events/test.webp');
            assert.equal(images[0].url, '/downloads/events/test.webp');
            assert.equal(images[0].fetchPriority, 'low');
            assert.equal(images[0].crossOrigin, undefined);
        } finally {
            if (previousImage === undefined) delete globalThis.Image;
            else globalThis.Image = previousImage;
            globalThis.fetch = previousFetch;
        }
    });
}
