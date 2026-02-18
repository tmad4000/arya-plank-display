import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const pathsToCopy = [
  ['index.html', 'index.html'],
  ['src', 'src'],
  ['public/plank-data.json', 'plank-data.json']
];

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const [from, to] of pathsToCopy) {
  const fromPath = path.join(rootDir, from);
  const toPath = path.join(distDir, to);
  copy(fromPath, toPath);
}

console.log(`Built static site in ${distDir}`);

function copy(fromPath, toPath) {
  const stat = fs.statSync(fromPath);

  if (stat.isDirectory()) {
    fs.mkdirSync(toPath, { recursive: true });

    for (const entry of fs.readdirSync(fromPath)) {
      copy(path.join(fromPath, entry), path.join(toPath, entry));
    }

    return;
  }

  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.copyFileSync(fromPath, toPath);
}
