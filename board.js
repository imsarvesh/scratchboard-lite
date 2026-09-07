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

function cloneImage(image) {
  return {
    id: image.id,
    src: image.src,
    x: image.x,
    y: image.y,
    w: image.w,
    h: image.h,
  };
}

function cloneImageList(images) {
  return images.map(cloneImage);
}

function isValidImageSrc(src) {
  return typeof src === 'string' && src.startsWith('data:image/');
}

function isValidGeometry({ x, y, w, h }) {
  return (
    isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(w) &&
    isFiniteNumber(h) &&
    w > 0 &&
    h > 0
  );
}

export class Board {
  constructor() {
    this.completed = [];
    this.inProgress = new Map();
    this.images = new Map();
    this.undoStack = [];
    this.redoStack = [];
  }

  getCompletedStrokes() {
    return cloneStrokeList(this.completed);
  }

  getImages() {
    return cloneImageList([...this.images.values()]);
  }

  getInitMessage() {
    return {
      type: 'init',
      strokes: this.getCompletedStrokes(),
      images: this.getImages(),
    };
  }

  getHistoryMessage() {
    return {
      type: 'history',
      strokes: this.getCompletedStrokes(),
      images: this.getImages(),
    };
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

  imageAdd({ id, src, x, y, w, h }) {
    if (typeof id !== 'string' || id.length === 0) return false;
    if (this.images.has(id)) return false;
    if (!isValidImageSrc(src)) return false;
    if (!isValidGeometry({ x, y, w, h })) return false;

    const image = cloneImage({ id, src, x, y, w, h });
    this.images.set(id, image);
    this.pushUndo({ type: 'image-add', image: cloneImage(image) });
    return true;
  }

  imageUpdate({ id, x, y, w, h }) {
    if (typeof id !== 'string' || id.length === 0) return false;
    if (!isValidGeometry({ x, y, w, h })) return false;
    const existing = this.images.get(id);
    if (!existing) return false;

    const before = cloneImage(existing);
    existing.x = x;
    existing.y = y;
    existing.w = w;
    existing.h = h;
    const after = cloneImage(existing);
    this.pushUndo({ type: 'image-update', id, before, after });
    return true;
  }

  imageRemove({ id }) {
    if (typeof id !== 'string' || id.length === 0) return false;
    const existing = this.images.get(id);
    if (!existing) return false;
    this.images.delete(id);
    this.pushUndo({ type: 'image-remove', image: cloneImage(existing) });
    return true;
  }

  clear() {
    if (
      this.completed.length === 0 &&
      this.inProgress.size === 0 &&
      this.images.size === 0
    ) {
      return false;
    }
    this.pushUndo({
      type: 'clear',
      strokes: this.getCompletedStrokes(),
      images: this.getImages(),
    });
    this.completed = [];
    this.inProgress.clear();
    this.images.clear();
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

    if (action.type === 'image-add') {
      this.images.delete(action.image.id);
      this.redoStack.push(action);
      return true;
    }

    if (action.type === 'image-update') {
      this.images.set(action.id, cloneImage(action.before));
      this.redoStack.push(action);
      return true;
    }

    if (action.type === 'image-remove') {
      this.images.set(action.image.id, cloneImage(action.image));
      this.redoStack.push(action);
      return true;
    }

    if (action.type === 'clear') {
      this.completed = cloneStrokeList(action.strokes);
      this.images = new Map(
        (action.images || []).map((img) => [img.id, cloneImage(img)]),
      );
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

    if (action.type === 'image-add') {
      this.images.set(action.image.id, cloneImage(action.image));
      this.pushUndoKeepRedo({
        type: 'image-add',
        image: cloneImage(action.image),
      });
      return true;
    }

    if (action.type === 'image-update') {
      this.images.set(action.id, cloneImage(action.after));
      this.pushUndoKeepRedo({
        type: 'image-update',
        id: action.id,
        before: cloneImage(action.before),
        after: cloneImage(action.after),
      });
      return true;
    }

    if (action.type === 'image-remove') {
      this.images.delete(action.image.id);
      this.pushUndoKeepRedo({
        type: 'image-remove',
        image: cloneImage(action.image),
      });
      return true;
    }

    if (action.type === 'clear') {
      const beforeStrokes = this.getCompletedStrokes();
      const beforeImages = this.getImages();
      this.completed = [];
      this.images.clear();
      this.pushUndoKeepRedo({
        type: 'clear',
        strokes: beforeStrokes,
        images: beforeImages,
      });
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
