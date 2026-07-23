import fs from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const PAPER = [0xe4, 0xeb, 0xf3, 255];
const INK = [0x2a, 0x6f, 0x97, 255];
const AMBER = [0xd6, 0x89, 0x10, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decode a simple 8-bit RGB/RGBA PNG (no interlace). Supports filters 0–4. */
function decodePng(fileBuf) {
  if (fileBuf[0] !== 137 || fileBuf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  while (offset + 8 <= fileBuf.length) {
    const len = fileBuf.readUInt32BE(offset);
    const type = fileBuf.toString('ascii', offset + 4, offset + 8);
    const data = fileBuf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format depth=${bitDepth} type=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const inflated = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let src = 0;

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    for (let i = 0; i < stride; i++) cur[i] = inflated[src++];
    if (filter === 1) {
      for (let i = 0; i < stride; i++) cur[i] = (cur[i] + (i >= bpp ? cur[i - bpp] : 0)) & 255;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) cur[i] = (cur[i] + prev[i]) & 255;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? cur[i - bpp] : 0;
        cur[i] = (cur[i] + ((left + prev[i]) >> 1)) & 255;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? cur[i - bpp] : 0;
        const up = prev[i];
        const upLeft = i >= bpp ? prev[i - bpp] : 0;
        cur[i] = (cur[i] + paeth(left, up, upLeft)) & 255;
      }
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter ${filter}`);
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      rgba[di] = cur[si];
      rgba[di + 1] = cur[si + 1];
      rgba[di + 2] = cur[si + 2];
      rgba[di + 3] = bpp === 4 ? cur[si + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, rgba };
}

function resizeRgba(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y + 0.5) * (sh / dh)));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x + 0.5) * (sw / dw)));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/** Pad content onto paper background for maskable safe zone. */
function padOnPaper(src, sw, sh, size, contentRatio = 0.7) {
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    out[o] = PAPER[0];
    out[o + 1] = PAPER[1];
    out[o + 2] = PAPER[2];
    out[o + 3] = 255;
  }
  const inner = Math.round(size * contentRatio);
  const scaled = resizeRgba(src, sw, sh, inner, inner);
  const ox = Math.floor((size - inner) / 2);
  const oy = ox;
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const si = (y * inner + x) * 4;
      const di = ((y + oy) * size + (x + ox)) * 4;
      const a = scaled[si + 3] / 255;
      if (a <= 0) continue;
      if (a >= 0.995) {
        out[di] = scaled[si];
        out[di + 1] = scaled[si + 1];
        out[di + 2] = scaled[si + 2];
        out[di + 3] = 255;
      } else {
        const inv = 1 - a;
        out[di] = Math.round(scaled[si] * a + out[di] * inv);
        out[di + 1] = Math.round(scaled[si + 1] * a + out[di + 1] * inv);
        out[di + 2] = Math.round(scaled[si + 2] * a + out[di + 2] * inv);
        out[di + 3] = 255;
      }
    }
  }
  return out;
}

function setPixel(buf, w, x, y, rgba) {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= w || yi >= w) return;
  const i = (yi * w + xi) * 4;
  const a = rgba[3] / 255;
  if (a >= 0.995) {
    buf[i] = rgba[0];
    buf[i + 1] = rgba[1];
    buf[i + 2] = rgba[2];
    buf[i + 3] = 255;
    return;
  }
  const inv = 1 - a;
  buf[i] = Math.round(rgba[0] * a + buf[i] * inv);
  buf[i + 1] = Math.round(rgba[1] * a + buf[i + 1] * inv);
  buf[i + 2] = Math.round(rgba[2] * a + buf[i + 2] * inv);
  buf[i + 3] = Math.min(255, Math.round(buf[i + 3] + rgba[3] * (1 - buf[i + 3] / 255)));
}

function fillCircle(buf, w, cx, cy, r, rgba) {
  const r2 = r * r;
  const x0 = Math.floor(cx - r - 1);
  const x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(cy - r - 1);
  const y1 = Math.ceil(cy + r + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (d <= r2) setPixel(buf, w, x, y, rgba);
      else if (d <= (r + 0.65) ** 2) {
        const edge = 1 - (Math.sqrt(d) - r) / 0.65;
        if (edge > 0) setPixel(buf, w, x, y, [rgba[0], rgba[1], rgba[2], Math.round(rgba[3] * edge)]);
      }
    }
  }
}

function strokePolyline(buf, w, points, width, rgba) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const steps = Math.ceil(len * 2.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      fillCircle(buf, w, x0 + dx * t, y0 + dy * t, width / 2, rgba);
    }
  }
}

/** Bold free scribble (concept A) — mirrors icon-concept-a master. */
function markPoints(size) {
  const anchors = [
    [0.34, 0.33],
    [0.27, 0.42],
    [0.28, 0.55],
    [0.35, 0.64],
    [0.45, 0.62],
    [0.51, 0.52],
    [0.56, 0.38],
    [0.66, 0.28],
    [0.76, 0.3],
    [0.82, 0.42],
    [0.8, 0.55],
    [0.84, 0.62],
    [0.89, 0.62],
  ];
  const pts = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const e = t * t * (3 - 2 * t);
      pts.push([(a[0] + (b[0] - a[0]) * e) * size, (a[1] + (b[1] - a[1]) * e) * size]);
    }
  }
  return pts;
}

function drawIcon(size, { pad = 0.08 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    buf[o] = PAPER[0];
    buf[o + 1] = PAPER[1];
    buf[o + 2] = PAPER[2];
    buf[o + 3] = 255;
  }
  const inner = size * (1 - pad * 2);
  const ox = size * pad;
  const pts = markPoints(inner).map(([x, y]) => [x + ox, y + ox]);
  strokePolyline(buf, size, pts, inner * 0.11, INK);
  const tip = pts[pts.length - 1];
  fillCircle(buf, size, tip[0], tip[1], inner * 0.07, AMBER);
  return buf;
}

function findMasterPng(iconsDir) {
  const home = process.env.HOME || '';
  const candidates = [
    path.join(iconsDir, 'icon-master.png'),
    // Exact concept A art the user approved in brainstorming
    path.join(
      home,
      '.cursor/projects/Users-sarvesh-Desktop-scratchboard-lite/assets/icon-concept-a.png',
    ),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

export const ICON_TARGETS = [
  { name: 'icon-512.png', size: 512, pad: 0.08, maskable: false },
  { name: 'icon-192.png', size: 192, pad: 0.08, maskable: false },
  { name: 'apple-touch-icon.png', size: 180, pad: 0.08, maskable: false },
  { name: 'favicon-32.png', size: 32, pad: 0.06, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, pad: 0.18, maskable: true },
];

/** Bump to force PNG regen on next ensurePwaIcons (server start / npm run icons). */
export const ICON_REVISION = '5-concept-a-master';

/** Write missing PNGs into iconsDir. Returns list of written filenames. */
export function ensurePwaIcons(iconsDir, { force = false } = {}) {
  fs.mkdirSync(iconsDir, { recursive: true });
  const revPath = path.join(iconsDir, '.icon-revision');
  let stale = force;
  try {
    if (fs.readFileSync(revPath, 'utf8').trim() !== ICON_REVISION) stale = true;
  } catch {
    stale = true;
  }

  const written = [];
  let master = null;
  const masterPath = findMasterPng(iconsDir);
  if (masterPath) {
    try {
      master = decodePng(fs.readFileSync(masterPath));
      const localMaster = path.join(iconsDir, 'icon-master.png');
      if (path.resolve(masterPath) !== path.resolve(localMaster)) {
        fs.copyFileSync(masterPath, localMaster);
      }
    } catch {
      master = null;
    }
  }

  for (const { name, size, pad, maskable } of ICON_TARGETS) {
    const dest = path.join(iconsDir, name);
    if (!stale && fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;

    let rgba;
    if (master) {
      if (maskable) {
        rgba = padOnPaper(master.rgba, master.width, master.height, size, 0.7);
      } else {
        rgba = resizeRgba(master.rgba, master.width, master.height, size, size);
      }
    } else {
      rgba = drawIcon(size, { pad: maskable ? 0.18 : pad });
    }
    fs.writeFileSync(dest, encodePng(size, size, rgba));
    written.push(name);
  }
  fs.writeFileSync(revPath, ICON_REVISION);
  return written;
}
