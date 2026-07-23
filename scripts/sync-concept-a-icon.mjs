/**
 * Sync approved concept A art into public/icons and regenerate PNGs.
 * Run: node scripts/sync-concept-a-icon.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePwaIcons } from '../icons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iconsDir = path.join(root, 'public', 'icons');
const src = path.join(
  process.env.HOME || '',
  '.cursor/projects/Users-sarvesh-Desktop-scratchboard-lite/assets/icon-concept-a.png',
);
const dest = path.join(iconsDir, 'icon-master.png');

if (!fs.existsSync(src)) {
  console.error('Missing concept A master at', src);
  process.exit(1);
}

fs.mkdirSync(iconsDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Copied', src, '→', dest);

const written = ensurePwaIcons(iconsDir, { force: true });
console.log('Wrote', written.join(', ') || '(none)');
