import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../board.js';

describe('Board', () => {
  it('starts empty and init has no strokes', () => {
    const board = new Board();
    assert.deepEqual(board.getInitMessage(), { type: 'init', strokes: [] });
  });

  it('completes a stroke into history', () => {
    const board = new Board();
    assert.equal(board.strokeStart({ id: 'a', x: 1, y: 2 }), true);
    assert.equal(board.strokeMove({ id: 'a', points: [[3, 4], [5, 6]] }), true);
    assert.equal(board.strokeEnd({ id: 'a' }), true);
    assert.deepEqual(board.getInitMessage().strokes, [
      {
        id: 'a',
        color: '#000000',
        width: 3,
        points: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      },
    ]);
  });

  it('ignores move/end for unknown id', () => {
    const board = new Board();
    assert.equal(board.strokeMove({ id: 'x', points: [[1, 1]] }), false);
    assert.equal(board.strokeEnd({ id: 'x' }), false);
  });

  it('clear empties completed and in-progress strokes', () => {
    const board = new Board();
    board.strokeStart({ id: 'a', x: 0, y: 0 });
    board.strokeEnd({ id: 'a' });
    board.strokeStart({ id: 'b', x: 1, y: 1 });
    board.clear();
    assert.deepEqual(board.getInitMessage().strokes, []);
    assert.equal(board.strokeEnd({ id: 'b' }), false);
  });

  it('rejects malformed strokeStart', () => {
    const board = new Board();
    assert.equal(board.strokeStart({ id: '', x: 1, y: 2 }), false);
    assert.equal(board.strokeStart({ id: 'a', x: 'bad', y: 2 }), false);
  });
});
