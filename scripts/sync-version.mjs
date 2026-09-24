import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const checkOnly = process.argv.includes('--check');
const jsFiles = (await readdir(path.join(root, 'js')))
    .filter(file => file.endsWith('.js'))
    .map(file => path.join('js', file));
const files = ['index.html', 'main.js', 'service-worker.js', ...jsFiles];
const stale = [];

for (const file of files) {
    const filePath = path.join(root, file);
    const source = await readFile(filePath, 'utf8');
    const updated = source
        .replace(/(\?v=)1\.4\.\d+/g, `$1${version}`)
        .replace(/(APP_VERSION\s*=\s*["'])1\.4\.\d+(["'])/g, `$1${version}$2`)
        .replace(/(lichternacht-v)1\.4\.\d+/g, `$1${version}`);

    if (updated === source) continue;
    if (checkOnly) stale.push(file);
    else await writeFile(filePath, updated);
}

if (stale.length > 0) {
    console.error(`Versionskennung ${version} fehlt in: ${stale.join(', ')}`);
    process.exitCode = 1;
} else if (!checkOnly) {
    console.log(`Versionskennungen auf ${version} synchronisiert.`);
}
