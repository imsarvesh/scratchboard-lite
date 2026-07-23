const DEFAULT_COLOR = '#1a1a1a';
const DEFAULT_SIZE = 5;
const ERASER_SCALE = 3;
const MAX_UNDO = 100;
const VALID_TOOLS = new Set(['pen', 'eraser']);
const VALID_SIZES = new Set([2, 5, 10]);
const VALID_COLORS = new Set([
  '#1a1a1a',
  '#c0392b',
  '#2471a3',
  '#1e8449',
  '#d68910',
]);

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isPoint(p) {
  return Array.isArray(p) && p.length >= 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]);
}

function resolveWidth(tool, size) {
  return tool === 'eraser' ? size * ERASER_SCALE : size;
}

function cloneStroke(stroke) {
  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    size: stroke.size,
    width: stroke.width,
    points: (stroke.points || []).map((p) => [p[0], p[1]]),
  };
}

function cloneStrokeList(strokes) {
  return strokes.map(cloneStroke);
}

export class Board {
  constructor() {
    this.completed = [];
    this.inProgress = new Map();
    this.undoStack = [];
    this.redoStack = [];
  }

  getCompletedStrokes() {
    return cloneStrokeList(this.completed);
  }

  getInitMessage() {
    return { type: 'init', strokes: this.getCompletedStrokes() };
  }

  getHistoryMessage() {
    return { type: 'history', strokes: this.getCompletedStrokes() };
  }

  pushUndo(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  strokeStart({ id, x, y, tool, color, size }) {
    if (typeof id !== 'string' || id.length === 0) return false;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
    if (!VALID_TOOLS.has(tool)) return false;
    if (!VALID_SIZES.has(size)) return false;

    let strokeColor = DEFAULT_COLOR;
    if (tool === 'pen') {
      if (!VALID_COLORS.has(color)) return false;
      strokeColor = color;
    }

    this.inProgress.set(id, {
      id,
      tool,
      color: strokeColor,
      size,
      width: resolveWidth(tool, size),
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
    const saved = cloneStroke(stroke);
    this.completed.push(saved);
    this.pushUndo({ type: 'add', stroke: cloneStroke(saved) });
    return true;
  }

  clear() {
    if (this.completed.length === 0 && this.inProgress.size === 0) return false;
    this.pushUndo({ type: 'clear', strokes: this.getCompletedStrokes() });
    this.completed = [];
    this.inProgress.clear();
    return true;
  }

  undo() {
    const action = this.undoStack.pop();
    if (!action) return false;
    this.inProgress.clear();

    if (action.type === 'add') {
      this.completed = this.completed.filter((s) => s.id !== action.stroke.id);
      this.redoStack.push(action);
      return true;
    }

    if (action.type === 'clear') {
      this.completed = cloneStrokeList(action.strokes);
      this.redoStack.push({ type: 'clear' });
      return true;
    }

    return false;
  }

  redo() {
    const action = this.redoStack.pop();
    if (!action) return false;
    this.inProgress.clear();

    if (action.type === 'add') {
      this.completed.push(cloneStroke(action.stroke));
      this.pushUndoKeepRedo({ type: 'add', stroke: cloneStroke(action.stroke) });
      return true;
    }

    if (action.type === 'clear') {
      const before = this.getCompletedStrokes();
      this.completed = [];
      this.pushUndoKeepRedo({ type: 'clear', strokes: before });
      return true;
    }

    return false;
  }

  pushUndoKeepRedo(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }
}

export { DEFAULT_SIZE, resolveWidth };
