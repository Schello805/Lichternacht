import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtimeFiles = [
    'main.js',
    'js/admin.js',
    'js/auth.js',
    'js/data.js',
    'js/gamification.js',
    'js/maplibre-map.js',
    'js/ui.js'
];

const versionedFiles = [
    'index.html',
    'main.js',
    'service-worker.js',
    ...runtimeFiles
];

test('browser imports of utils use the current cache-busting version', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const expectedSuffix = `utils.js?v=${packageJson.version}`;

    for (const file of runtimeFiles) {
        const source = await readFile(file, 'utf8');
        const imports = [...source.matchAll(/from\s+['"]([^'"]*utils\.js(?:\?[^'"]*)?)['"]/g)];
        for (const match of imports) {
            assert.ok(match[1].endsWith(expectedSuffix), `${file}: ${match[1]} muss ${expectedSuffix} verwenden`);
        }
    }
});

test('runtime cache versions match package.json', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const versionPattern = /(?:\?v=|APP_VERSION\s*=\s*["']|lichternacht-v)(1\.4\.\d+)/g;

    for (const file of new Set(versionedFiles)) {
        const source = await readFile(file, 'utf8');
        for (const match of source.matchAll(versionPattern)) {
            assert.equal(match[1], packageJson.version, `${file}: Versionskennung ${match[1]} ist veraltet`);
        }
    }
});

test('visitor data prefers Firestore server reads and refreshes periodically', async () => {
    const dataSource = await readFile('js/data.js', 'utf8');
    const mainSource = await readFile('main.js', 'utf8');

    assert.match(dataSource, /getDocFromServer/);
    assert.match(dataSource, /getDocsFromServer/);
    assert.match(mainSource, /visibilitychange/);
    assert.match(mainSource, /refreshVisitorDataIfStale/);
});
