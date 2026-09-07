export const EXPORT_PADDING = 48;
export const EXPORT_PAPER = '#eef2f6';
export const EXPORT_MAX_SIDE = 8192;

/**
 * @param {{ width: number, points: number[][] }[]} strokes
 * @param {number} [padding]
 * @returns {{ minX: number, minY: number, width: number, height: number } | null}
 */
export function computeContentBounds(strokes, padding = EXPORT_PADDING) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;

  for (const stroke of strokes || []) {
    const half = (stroke.width ?? 0) / 2;
    for (const p of stroke.points || []) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = p[0];
      const y = p[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      any = true;
      minX = Math.min(minX, x - half);
      minY = Math.min(minY, y - half);
      maxX = Math.max(maxX, x + half);
      maxY = Math.max(maxY, y + half);
    }
  }

  if (!any) return null;

  return {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} [maxSide]
 * @returns {{ width: number, height: number, scale: number }}
 */
export function fitExportSize(width, height, maxSide = EXPORT_MAX_SIDE) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const longest = Math.max(w, h);
  if (longest <= maxSide) {
    return {
      width: Math.max(1, Math.round(w)),
      height: Math.max(1, Math.round(h)),
      scale: 1,
    };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
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
 * Render erasable ink on a transparent layer, then place it over opaque paper.
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
  const ink = createCanvas();
  output.width = ink.width = fitted.width;
  output.height = ink.height = fitted.height;

  const outputCtx = output.getContext('2d');
  const inkCtx = ink.getContext('2d');
  if (!outputCtx || !inkCtx) return null;

  outputCtx.fillStyle = EXPORT_PAPER;
  outputCtx.fillRect(0, 0, fitted.width, fitted.height);

  inkCtx.setTransform(
    fitted.scale,
    0,
    0,
    fitted.scale,
    -bounds.minX * fitted.scale,
    -bounds.minY * fitted.scale,
  );
  drawInk(inkCtx);
  outputCtx.drawImage(ink, 0, 0);
  return output;
}
