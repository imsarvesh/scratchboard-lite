import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../board.js';

describe('Board', () => {
  it('starts empty and init has no strokes', () => {
    const board = new Board();
    assert.deepEqual(board.getInitMessage(), {
      type: 'init',
      strokes: [],
      images: [],
    });
  });

  it('completes a pen stroke into history', () => {
    const board = new Board();
    assert.equal(
      board.strokeStart({
        id: 'a',
        x: 1,
        y: 2,
        tool: 'pen',
        color: '#1a1a1a',
        size: 5,
      }),
      true,
    );
    assert.equal(board.strokeMove({ id: 'a', points: [[3, 4], [5, 6]] }), true);
    assert.equal(board.strokeEnd({ id: 'a' }), true);
    assert.deepEqual(board.getInitMessage().strokes, [
      {
        id: 'a',
        tool: 'pen',
        color: '#1a1a1a',
        size: 5,
        width: 5,
        points: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      },
    ]);
  });

  it('stores pen color from allowed palette', () => {
    const board = new Board();
    assert.equal(
      board.strokeStart({
        id: 'r',
        x: 0,
        y: 0,
        tool: 'pen',
        color: '#c0392b',
        size: 5,
      }),
      true,
    );
    assert.equal(board.strokeEnd({ id: 'r' }), true);
    assert.equal(board.getInitMessage().strokes[0].color, '#c0392b');
  });

  it('scales eraser width from size', () => {
    const board = new Board();
    assert.equal(
      board.strokeStart({ id: 'e', x: 10, y: 10, tool: 'eraser', size: 5 }),
      true,
    );
    assert.equal(board.strokeEnd({ id: 'e' }), true);
    assert.deepEqual(board.getInitMessage().strokes[0], {
      id: 'e',
      tool: 'eraser',
      color: '#1a1a1a',
      size: 5,
      width: 15,
      points: [[10, 10]],
    });
  });

  it('accepts thin and thick sizes', () => {
    const board = new Board();
    assert.equal(
      board.strokeStart({
        id: 't',
        x: 0,
        y: 0,
        tool: 'pen',
        color: '#1a1a1a',
        size: 2,
      }),
      true,
    );
    board.strokeEnd({ id: 't' });
    assert.equal(board.getCompletedStrokes()[0].width, 2);
    assert.equal(
      board.strokeStart({
        id: 'k',
        x: 1,
        y: 1,
        tool: 'pen',
        color: '#1a1a1a',
        size: 10,
      }),
      true,
    );
    board.strokeEnd({ id: 'k' });
    assert.equal(board.getCompletedStrokes()[1].width, 10);
  });

  it('ignores move/end for unknown id', () => {
    const board = new Board();
    assert.equal(board.strokeMove({ id: 'x', points: [[1, 1]] }), false);
    assert.equal(board.strokeEnd({ id: 'x' }), false);
  });

  it('clear empties completed and in-progress strokes', () => {
    const board = new Board();
    board.strokeStart({
      id: 'a',
      x: 0,
      y: 0,
      tool: 'pen',
      color: '#1a1a1a',
      size: 5,
    });
    board.strokeEnd({ id: 'a' });
    board.strokeStart({
      id: 'b',
      x: 1,
      y: 1,
      tool: 'pen',
      color: '#1a1a1a',
      size: 5,
    });
    board.clear();
    assert.deepEqual(board.getInitMessage().strokes, []);
    assert.equal(board.strokeEnd({ id: 'b' }), false);
  });

  it('rejects malformed strokeStart', () => {
    const board = new Board();
    assert.equal(
      board.strokeStart({
        id: '',
        x: 1,
        y: 2,
        tool: 'pen',
        color: '#1a1a1a',
        size: 5,
      }),
      false,
    );
    assert.equal(
      board.strokeStart({
        id: 'a',
        x: 'bad',
        y: 2,
        tool: 'pen',
        color: '#1a1a1a',
        size: 5,
      }),
      false,
    );
    assert.equal(board.strokeStart({ id: 'a', x: 1, y: 2 }), false);
    assert.equal(board.strokeStart({ id: 'a', x: 1, y: 2, tool: 'marker' }), false);
    assert.equal(
      board.strokeStart({
        id: 'a',
        x: 1,
        y: 2,
        tool: 'pen',
        color: '#ff00ff',
        size: 5,
      }),
      false,
    );
    assert.equal(
      board.strokeStart({
        id: 'a',
        x: 1,
        y: 2,
        tool: 'pen',
        color: '#1a1a1a',
        size: 7,
      }),
      false,
    );
  });

  it('undoes and redoes a stroke for everyone', () => {
    const board = new Board();
    board.strokeStart({
      id: 'a',
      x: 0,
      y: 0,
      tool: 'pen',
      color: '#1a1a1a',
      size: 5,
    });
    board.strokeEnd({ id: 'a' });
    assert.equal(board.getCompletedStrokes().length, 1);
    assert.equal(board.undo(), true);
    assert.deepEqual(board.getCompletedStrokes(), []);
    assert.equal(board.redo(), true);
    assert.equal(board.getCompletedStrokes().length, 1);
    assert.equal(board.getCompletedStrokes()[0].id, 'a');
  });

  it('undoes clear and restores strokes', () => {
    const board = new Board();
    board.strokeStart({
      id: 'a',
      x: 0,
      y: 0,
      tool: 'pen',
      color: '#1a1a1a',
      size: 5,
    });
    board.strokeEnd({ id: 'a' });
    board.clear();
    assert.deepEqual(board.getCompletedStrokes(), []);
    assert.equal(board.undo(), true);
    assert.equal(board.getCompletedStrokes().length, 1);
  });

  it('returns false when nothing to undo or redo', () => {
    const board = new Board();
    assert.equal(board.undo(), false);
    assert.equal(board.redo(), false);
  });

  const sampleImage = {
    id: 'img1',
    src: 'data:image/png;base64,abc',
    x: 10,
    y: 20,
    w: 100,
    h: 80,
  };

  it('adds an image into history', () => {
    const board = new Board();
    assert.equal(board.imageAdd({ ...sampleImage }), true);
    assert.deepEqual(board.getInitMessage().images, [sampleImage]);
  });

  it('rejects malformed imageAdd', () => {
    const board = new Board();
    assert.equal(board.imageAdd({ ...sampleImage, id: '' }), false);
    assert.equal(board.imageAdd({ ...sampleImage, src: 'http://x' }), false);
    assert.equal(board.imageAdd({ ...sampleImage, w: 0 }), false);
    assert.equal(board.imageAdd({ ...sampleImage, h: -1 }), false);
    assert.equal(board.imageAdd({ ...sampleImage, x: 'bad' }), false);
  });

  it('updates image geometry', () => {
    const board = new Board();
    board.imageAdd({ ...sampleImage });
    assert.equal(
      board.imageUpdate({ id: 'img1', x: 5, y: 6, w: 50, h: 40 }),
      true,
    );
    assert.deepEqual(board.getImages()[0], {
      ...sampleImage,
      x: 5,
      y: 6,
      w: 50,
      h: 40,
    });
  });

  it('removes an image', () => {
    const board = new Board();
    board.imageAdd({ ...sampleImage });
    assert.equal(board.imageRemove({ id: 'img1' }), true);
    assert.deepEqual(board.getImages(), []);
  });

  it('clear empties images and restores them on undo', () => {
    const board = new Board();
    board.imageAdd({ ...sampleImage });
    assert.equal(board.clear(), true);
    assert.deepEqual(board.getInitMessage().images, []);
    assert.equal(board.undo(), true);
    assert.equal(board.getImages().length, 1);
    assert.equal(board.getImages()[0].id, 'img1');
  });

  it('undoes and redoes image add', () => {
    const board = new Board();
    board.imageAdd({ ...sampleImage });
    assert.equal(board.undo(), true);
    assert.deepEqual(board.getImages(), []);
    assert.equal(board.redo(), true);
    assert.equal(board.getImages()[0].id, 'img1');
  });

  it('undoes and redoes image update', () => {
    const board = new Board();
    board.imageAdd({ ...sampleImage });
    board.imageUpdate({ id: 'img1', x: 1, y: 2, w: 30, h: 40 });
    assert.equal(board.undo(), true);
    assert.deepEqual(board.getImages()[0], sampleImage);
    assert.equal(board.redo(), true);
    assert.equal(board.getImages()[0].w, 30);
  });

  it('undoes and redoes image remove', () => {
    const board = new Board();
    board.imageAdd({ ...sampleImage });
    board.imageRemove({ id: 'img1' });
    assert.equal(board.undo(), true);
    assert.equal(board.getImages().length, 1);
    assert.equal(board.redo(), true);
    assert.deepEqual(board.getImages(), []);
  });

  it('rejects duplicate imageAdd id', () => {
    const board = new Board();
    assert.equal(board.imageAdd({ ...sampleImage }), true);
    assert.equal(board.imageAdd({ ...sampleImage }), false);
  });
});
