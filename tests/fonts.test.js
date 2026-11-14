import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('all public pages load the bundled fonts instead of Google Fonts', async () => {
    for (const file of ['index.html', 'help.html', 'datenschutz.html', 'gewinnspiel.html', 'impressum.html']) {
        const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
        assert.match(html, /href="vendor\/fonts\/fonts\.css\?v=/);
        assert.doesNotMatch(html, /https?:\/\/fonts\.(googleapis|gstatic)\.com/);
    }
});

test('bundled fonts are local WOFF2 assets with retained licenses and Latin coverage', async () => {
    const stylesheet = await readFile(new URL('../vendor/fonts/fonts.css', import.meta.url), 'utf8');
    const urls = [...stylesheet.matchAll(/url\(([^)]+)\)/g)].map(match => match[1]);
    assert.equal(new Set(urls).size, 8);
    assert.ok(urls.every(url => /^[a-z0-9-]+\.woff2$/.test(url)));
    assert.match(stylesheet, /font-family: 'Cinzel'/);
    assert.match(stylesheet, /font-family: 'Lato'/);
    assert.match(stylesheet, /U\+0000-00FF/);
    assert.match(stylesheet, /U\+20AC/);
    for (const file of new Set(urls)) {
        const contents = await readFile(new URL(`../vendor/fonts/${file}`, import.meta.url));
        assert.equal(contents.subarray(0, 4).toString(), 'wOF2');
        assert.ok(contents.length > 1000);
    }
    for (const family of ['Cinzel', 'Lato']) {
        const license = await readFile(new URL(`../vendor/fonts/${family}-OFL.txt`, import.meta.url), 'utf8');
        assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
    }
    const worker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
    assert.match(worker, /const FONT_CACHE = 'local-fonts-v1'/);
    assert.doesNotMatch(worker, /url\.origin === 'https:\/\/fonts\./);
});
