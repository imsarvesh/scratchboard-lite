import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitPasteSize,
  hitTestHandle,
  hitTestImage,
  resizeFromHandle,
} from '../public/image-geom.js';

describe('image-geom', () => {
  it('fits large images down to max side', () => {
    assert.deepEqual(fitPasteSize(800, 400, 400), { w: 400, h: 200 });
  });

  it('keeps small images at native size', () => {
    assert.deepEqual(fitPasteSize(100, 50, 400), { w: 100, h: 50 });
  });

  it('hits topmost image containing the point', () => {
    const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 };
    const b = { id: 'b', x: 50, y: 50, w: 100, h: 100 };
    assert.equal(hitTestImage([a, b], 60, 60).id, 'b');
    assert.equal(hitTestImage([a, b], 10, 10).id, 'a');
    assert.equal(hitTestImage([a, b], 200, 200), null);
  });

  it('detects corner handles', () => {
    const img = { id: 'a', x: 10, y: 20, w: 100, h: 80 };
    assert.equal(hitTestHandle(img, 10, 20), 'nw');
    assert.equal(hitTestHandle(img, 110, 20), 'ne');
    assert.equal(hitTestHandle(img, 10, 100), 'sw');
    assert.equal(hitTestHandle(img, 110, 100), 'se');
    assert.equal(hitTestHandle(img, 60, 60), null);
  });

  it('resizes from SE and NW handles with min side', () => {
    const img = { id: 'a', x: 0, y: 0, w: 100, h: 100 };
    assert.deepEqual(resizeFromHandle(img, 'se', 150, 120, 20), {
      x: 0,
      y: 0,
      w: 150,
      h: 120,
    });
    assert.deepEqual(resizeFromHandle(img, 'nw', 40, 30, 20), {
      x: 40,
      y: 30,
      w: 60,
      h: 70,
    });
  });
});
