import { ensurePwaIcons } from '../icons.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS = path.join(__dirname, '..', 'public', 'icons');

const written = ensurePwaIcons(ICONS, { force: true });
console.log('Wrote', written.join(', ') || '(none)', '→', ICONS);
