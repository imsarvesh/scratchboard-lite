import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_PADDING,
  EXPORT_PAPER,
  EXPORT_MAX_SIDE,
  computeContentBounds,
  fitExportSize,
  exportFilename,
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

  it('formats local date filename', () => {
    const d = new Date(2026, 8, 7); // Sep 7, 2026 local
    assert.equal(exportFilename(d), 'scratchboard-2026-09-07.png');
  });
});
