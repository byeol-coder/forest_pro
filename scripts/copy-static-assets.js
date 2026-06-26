const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const staticEntries = [
  '.nojekyll',
  'embed.js',
  'tts-engine.js',
  'ui-controls.js',
  'a11y.js',
  'screens.js',
  'narrative.json',
  'models',
];

function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(dist, relativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing static asset: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

if (!fs.existsSync(dist)) {
  throw new Error('dist directory is missing. Run vite build before copying static assets.');
}

for (const entry of staticEntries) copyEntry(entry);

console.log(`Copied ${staticEntries.length} static deployment assets.`);
