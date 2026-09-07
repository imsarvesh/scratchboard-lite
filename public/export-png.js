export const EXPORT_PADDING = 48;
export const EXPORT_PAPER = '#eef2f6';
export const EXPORT_MAX_SIDE = 8192;

/**
 * @param {{ width: number, points: number[][] }[]} strokes
 * @param {number} [padding]
 * @returns {{ minX: number, minY: number, width: number, height: number } | null}
 */
export function computeContentBounds(strokes, padding = EXPORT_PADDING) {
  if (!Number.isFinite(padding) || padding < 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;

  for (const stroke of strokes || []) {
    if (!stroke) continue;
    const width = stroke.width ?? 0;
    if (!Number.isFinite(width) || width < 0) return null;
    const half = width / 2;
    for (const p of stroke.points || []) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = p[0];
      const y = p[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (
        Math.abs(x) > Number.MAX_SAFE_INTEGER ||
        Math.abs(y) > Number.MAX_SAFE_INTEGER
      ) {
        return null;
      }
      any = true;
      minX = Math.min(minX, x - half);
      minY = Math.min(minY, y - half);
      maxX = Math.max(maxX, x + half);
      maxY = Math.max(maxY, y + half);
    }
  }

  if (!any) return null;

  const bounds = {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.width > Number.MAX_SAFE_INTEGER ||
    bounds.height > Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }
  return bounds;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} [maxSide]
 * @returns {{ width: number, height: number, scale: number } | null}
 */
export function fitExportSize(width, height, maxSide = EXPORT_MAX_SIDE) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxSide) ||
    width <= 0 ||
    height <= 0 ||
    maxSide <= 0 ||
    width > Number.MAX_SAFE_INTEGER ||
    height > Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const longest = Math.max(w, h);
  if (longest <= maxSide) {
    const fitted = {
      width: Math.max(1, Math.round(w)),
      height: Math.max(1, Math.round(h)),
      scale: 1,
    };
    return Object.values(fitted).every(Number.isFinite) ? fitted : null;
  }
  const scale = maxSide / longest;
  const fitted = {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
  return Object.values(fitted).every(Number.isFinite) ? fitted : null;
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
export function exportFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `scratchboard-${y}-${m}-${d}.png`;
}

/**
 * Render erasable ink on transparency, then place opaque paper behind it.
 *
 * @param {{ minX: number, minY: number }} bounds
 * @param {{ width: number, height: number, scale: number }} fitted
 * @param {(context: CanvasRenderingContext2D) => void} drawInk
 * @param {() => HTMLCanvasElement} [createCanvas]
 * @returns {HTMLCanvasElement | null}
 */
export function renderExportLayers(
  bounds,
  fitted,
  drawInk,
  createCanvas = () => document.createElement('canvas'),
) {
  const output = createCanvas();
  output.width = fitted.width;
  output.height = fitted.height;

  const outputCtx = output.getContext('2d');
  if (!outputCtx) return null;

  outputCtx.setTransform(
    fitted.scale,
    0,
    0,
    fitted.scale,
    -bounds.minX * fitted.scale,
    -bounds.minY * fitted.scale,
  );
  drawInk(outputCtx);

  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalCompositeOperation = 'destination-over';
  outputCtx.fillStyle = EXPORT_PAPER;
  outputCtx.fillRect(0, 0, fitted.width, fitted.height);
  outputCtx.globalCompositeOperation = 'source-over';
  return output;
}
