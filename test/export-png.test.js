import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_PADDING,
  EXPORT_PAPER,
  EXPORT_MAX_SIDE,
  computeContentBounds,
  fitExportSize,
  exportFilename,
  renderExportLayers,
} from '../public/export-png.js';

describe('export-png helpers', () => {
  it('exposes design constants', () => {
    assert.equal(EXPORT_PADDING, 48);
    assert.equal(EXPORT_PAPER, '#eef2f6');
    assert.equal(EXPORT_MAX_SIDE, 8192);
  });

  it('returns null for empty stroke lists', () => {
    assert.equal(computeContentBounds([]), null);
    assert.equal(computeContentBounds([{ width: 5, points: [] }]), null);
  });

  it('bounds images alone with padding', () => {
    const bounds = computeContentBounds([], EXPORT_PADDING, [
      { x: 10, y: 20, w: 100, h: 50 },
    ]);
    assert.deepEqual(bounds, {
      minX: 10 - 48,
      minY: 20 - 48,
      width: 100 + 96,
      height: 50 + 96,
    });
  });

  it('unions strokes and images', () => {
    const bounds = computeContentBounds(
      [{ width: 2, points: [[0, 0]] }],
      0,
      [{ x: 50, y: 80, w: 10, h: 10 }],
    );
    // stroke: -1..1; image: 50..60, 80..90
    assert.deepEqual(bounds, {
      minX: -1,
      minY: -1,
      width: 61,
      height: 91,
    });
  });

  it('ignores invalid images', () => {
    assert.equal(
      computeContentBounds([], 0, [{ x: 0, y: 0, w: 0, h: 10 }]),
      null,
    );
    assert.deepEqual(
      computeContentBounds([], 0, [
        null,
        { x: 5, y: 5, w: 10, h: 10 },
      ]),
      { minX: 5, minY: 5, width: 10, height: 10 },
    );
  });

  it('ignores null and undefined stroke entries', () => {
    assert.deepEqual(
      computeContentBounds([null, undefined, { width: 2, points: [[10, 20]] }], 0),
      { minX: 9, minY: 19, width: 2, height: 2 },
    );
  });

  it('returns null when finite inputs overflow the bounds', () => {
    assert.equal(
      computeContentBounds([{ width: 2, points: [[-Number.MAX_VALUE, Number.MAX_VALUE]] }]),
      null,
    );
    assert.equal(
      computeContentBounds([
        { width: 1, points: [[-Number.MAX_VALUE, 0], [Number.MAX_VALUE, 0]] },
      ]),
      null,
    );
  });

  it('pads a single point by half-width plus EXPORT_PADDING', () => {
    const bounds = computeContentBounds([{ width: 10, points: [[100, 200]] }]);
    // half width = 5 → content 95..105, 195..205; +48 pad
    assert.deepEqual(bounds, {
      minX: 95 - 48,
      minY: 195 - 48,
      width: 10 + 96,
      height: 10 + 96,
    });
  });

  it('unions multiple strokes', () => {
    const bounds = computeContentBounds([
      { width: 2, points: [[0, 0], [10, 0]] },
      { width: 4, points: [[50, 80]] },
    ]);
    // stroke1: x -1..11, y -1..1; stroke2: x 48..52, y 78..82
    // union: x -1..52, y -1..82 → +48 pad
    assert.equal(bounds.minX, -1 - 48);
    assert.equal(bounds.minY, -1 - 48);
    assert.equal(bounds.width, 52 - -1 + 96);
    assert.equal(bounds.height, 82 - -1 + 96);
  });

  it('does not scale when under max side', () => {
    assert.deepEqual(fitExportSize(100, 50), { width: 100, height: 50, scale: 1 });
  });

  it('scales down uniformly when over max side', () => {
    const { width, height, scale } = fitExportSize(16000, 8000, 8192);
    assert.equal(scale, 8192 / 16000);
    assert.equal(width, 8192);
    assert.equal(height, 4096);
  });

  it('returns null for unusable dimensions', () => {
    assert.equal(fitExportSize(NaN, 100), null);
    assert.equal(fitExportSize(Infinity, 100), null);
    assert.equal(fitExportSize(Number.MAX_VALUE, Number.MAX_VALUE), null);
    assert.equal(fitExportSize(100, 100, 0), null);
  });

  it('formats local date filename', () => {
    const d = new Date(2026, 8, 7); // Sep 7, 2026 local
    assert.equal(exportFilename(d), 'scratchboard-2026-09-07.png');
  });

  it('draws ink then places opaque paper behind it on one canvas', () => {
    const canvases = [];
    const createCanvas = () => {
      const operations = [];
      const context = {
        operations,
        fillStyle: '',
        globalCompositeOperation: 'source-over',
        fillRect(...args) {
          operations.push([
            'fillRect',
            this.fillStyle,
            this.globalCompositeOperation,
            ...args,
          ]);
        },
        setTransform(...args) {
          operations.push(['setTransform', ...args]);
        },
      };
      const canvas = {
        width: 0,
        height: 0,
        context,
        getContext: () => context,
      };
      canvases.push(canvas);
      return canvas;
    };

    const output = renderExportLayers(
      { minX: 10, minY: 20 },
      { width: 100, height: 50, scale: 2 },
      (inkCtx) => {
        inkCtx.operations.push(['draw-ink']);
        inkCtx.globalCompositeOperation = 'destination-out';
        inkCtx.operations.push(['erase-ink']);
      },
      createCanvas,
    );

    assert.equal(canvases.length, 1);
    assert.equal(output, canvases[0]);
    assert.deepEqual(canvases[0].context.operations, [
      ['setTransform', 2, 0, 0, 2, -20, -40],
      ['draw-ink'],
      ['erase-ink'],
      ['setTransform', 1, 0, 0, 1, 0, 0],
      ['fillRect', EXPORT_PAPER, 'destination-over', 0, 0, 100, 50],
    ]);
    assert.equal(canvases[0].context.globalCompositeOperation, 'source-over');
  });
});
