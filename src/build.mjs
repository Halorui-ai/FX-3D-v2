// Bundle everything (three.js + data + textures) into one classic script so index.html opens from file:// offline.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '富士康厂区3D');
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, 'main.js')], bundle: true, format: 'iife', minify: true, target: 'es2020',
  outfile: join(out, 'app.js'), loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.hdr': 'binary' }, logLevel: 'info',
});
copyFileSync(join(here, 'index.html'), join(out, 'index.html'));
console.log('app.js', (statSync(join(out, 'app.js')).size / 1024).toFixed(0), 'KB ->', out);
