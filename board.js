const DEFAULT_COLOR = '#000000';
const DEFAULT_WIDTH = 3;

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isPoint(p) {
  return Array.isArray(p) && p.length >= 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]);
}

export class Board {
  constructor() {
    this.completed = [];
    this.inProgress = new Map();
  }

  getCompletedStrokes() {
    return this.completed.map((s) => ({
      id: s.id,
      color: s.color,
      width: s.width,
      points: s.points.map((p) => [p[0], p[1]]),
    }));
  }

  getInitMessage() {
    return { type: 'init', strokes: this.getCompletedStrokes() };
  }

  strokeStart({ id, x, y }) {
    if (typeof id !== 'string' || id.length === 0) return false;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
    this.inProgress.set(id, {
      id,
      color: DEFAULT_COLOR,
      width: DEFAULT_WIDTH,
      points: [[x, y]],
    });
    return true;
  }

  strokeMove({ id, points }) {
    if (typeof id !== 'string' || !Array.isArray(points)) return false;
    const stroke = this.inProgress.get(id);
    if (!stroke) return false;
    for (const p of points) {
      if (!isPoint(p)) return false;
      stroke.points.push([p[0], p[1]]);
    }
    return true;
  }

  strokeEnd({ id }) {
    if (typeof id !== 'string') return false;
    const stroke = this.inProgress.get(id);
    if (!stroke) return false;
    this.inProgress.delete(id);
    this.completed.push(stroke);
    return true;
  }

  clear() {
    this.completed = [];
    this.inProgress.clear();
  }
}
