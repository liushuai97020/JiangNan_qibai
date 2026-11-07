import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

for (const file of ['index.html', 'styles.css', 'favicon.svg']) {
  await fs.copyFile(path.join(root, file), path.join(out, file));
}

for (const dir of ['src', 'vendor']) {
  await fs.cp(path.join(root, dir), path.join(out, dir), { recursive: true });
}

console.log('Built static site to dist/');
