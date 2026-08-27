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
