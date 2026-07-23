const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('statusDot');
const liveStatus = document.getElementById('liveStatus');
const clearBtn = document.getElementById('clearBtn');
const dock = document.getElementById('dock');
const dockPosBtn = document.getElementById('dockPosBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const penBtn = document.getElementById('penBtn');
const eraserBtn = document.getElementById('eraserBtn');
const colorGroup = document.getElementById('colorGroup');
const colorSwatches = [...colorGroup.querySelectorAll('.color-swatch')];
const sizeGroup = document.getElementById('sizeGroup');
const sizeSwatches = [...sizeGroup.querySelectorAll('.size-swatch')];

const DEFAULT_COLOR = '#1a1a1a';
const DEFAULT_SIZE = 5;
const ERASER_SCALE = 3;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.15;
const GRID_GAP = 32;
const DOCK_POSITIONS = ['bottom', 'left', 'top', 'right'];
const DOCK_POS_KEY = 'scratchboard-dock-position';

let ws = null;
let reconnectDelay = 500;
let drawing = false;
let panning = false;
let spaceDown = false;
let strokeId = null;
let activeTool = 'pen';
let activeColor = DEFAULT_COLOR;
let activeSize = DEFAULT_SIZE;
let currentStrokeTool = 'pen';
let currentStrokeColor = DEFAULT_COLOR;
let currentStrokeSize = DEFAULT_SIZE;
let currentStrokeWidth = DEFAULT_SIZE;
let pendingPoints = [];
let flushTimer = null;
let remoteStrokes = new Map();
let localStrokePoints = [];
let strokeHistory = [];
let lastPoint = null;
let panPointerId = null;
let lastPanScreen = null;
let drawPointerId = null;
let usingPen = false;

/** Camera: screen = world * zoom + pan */
let zoom = 1;
let panX = 0;
let panY = 0;

function resolveWidth(tool, size) {
  return tool === 'eraser' ? size * ERASER_SCALE : size;
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function cloneStroke(stroke) {
  const tool = stroke.tool || 'pen';
  const size = stroke.size ?? DEFAULT_SIZE;
  return {
    id: stroke.id,
    tool,
    color: stroke.color || DEFAULT_COLOR,
    size,
    width: stroke.width ?? resolveWidth(tool, size),
    points: (stroke.points || []).map((p) => [p[0], p[1]]),
  };
}

function screenSize() {
  return {
    w: canvas.clientWidth || window.innerWidth,
    h: canvas.clientHeight || window.innerHeight,
  };
}

function screenToWorld(sx, sy) {
  return [(sx - panX) / zoom, (sy - panY) / zoom];
}

function applyCamera() {
  const dpr = devicePixelRatio;
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  resetComposite();
}

function applyToolStyle(tool, color = DEFAULT_COLOR, width = DEFAULT_SIZE) {
  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
  }
  ctx.lineWidth = width;
}

function resetComposite() {
  ctx.globalCompositeOperation = 'source-over';
}

function wipePixels() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
  const { w, h } = screenSize();
  const pad = GRID_GAP * 2;
  const left = (0 - panX) / zoom - pad;
  const top = (0 - panY) / zoom - pad;
  const right = (w - panX) / zoom + pad;
  const bottom = (h - panY) / zoom + pad;

  const startX = Math.floor(left / GRID_GAP) * GRID_GAP;
  const startY = Math.floor(top / GRID_GAP) * GRID_GAP;
  const dotR = 1.1 / zoom;

  ctx.beginPath();
  for (let x = startX; x <= right; x += GRID_GAP) {
    for (let y = startY; y <= bottom; y += GRID_GAP) {
      ctx.moveTo(x + dotR, y);
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = 'rgba(28, 36, 48, 0.14)';
  ctx.fill();
}

function drawSegment(x0, y0, x1, y1, tool, color, width) {
  applyToolStyle(tool, color, width);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  resetComposite();
}

function drawStrokePoints(points, tool = 'pen', color = DEFAULT_COLOR, width = DEFAULT_SIZE) {
  applyToolStyle(tool, color, width);
  if (!points || points.length < 2) {
    if (points?.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    resetComposite();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.stroke();
  resetComposite();
}

function updateZoomLabel() {
  /* zoom % UI removed; pinch / ctrl+scroll still works */
}

function updateCursor() {
  canvas.classList.toggle('is-panning', panning);
  canvas.classList.toggle('is-pan-ready', spaceDown && !panning && !drawing);
}

function redrawAll() {
  wipePixels();
  applyCamera();
  drawGrid();
  for (const s of strokeHistory) {
    drawStrokePoints(s.points, s.tool, s.color, s.width);
  }
  for (const entry of remoteStrokes.values()) {
    drawStrokePoints(entry.points, entry.tool, entry.color, entry.width);
  }
  if (drawing && localStrokePoints.length) {
    drawStrokePoints(
      localStrokePoints,
      currentStrokeTool,
      currentStrokeColor,
      currentStrokeWidth,
    );
  }
  updateZoomLabel();
}

function setZoomAt(nextZoom, screenX, screenY) {
  const before = screenToWorld(screenX, screenY);
  zoom = clampZoom(nextZoom);
  panX = screenX - before[0] * zoom;
  panY = screenY - before[1] * zoom;
  redrawAll();
}

function zoomBy(factor, screenX, screenY) {
  const { w, h } = screenSize();
  const sx = screenX ?? w / 2;
  const sy = screenY ?? h / 2;
  setZoomAt(zoom * factor, sx, sy);
}

function resetZoom() {
  const { w, h } = screenSize();
  zoom = 1;
  panX = w / 2;
  panY = h / 2;
  redrawAll();
}

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  redrawAll();
}

function setStatus(text, state = 'pending') {
  statusDot.classList.remove('is-live', 'is-down');
  if (state === 'live') statusDot.classList.add('is-live');
  if (state === 'down') statusDot.classList.add('is-down');
  if (liveStatus) {
    liveStatus.title = text;
    liveStatus.setAttribute('aria-label', text);
  }
}

function setActiveTool(tool) {
  activeTool = tool;
  penBtn.classList.toggle('is-active', tool === 'pen');
  eraserBtn.classList.toggle('is-active', tool === 'eraser');
  colorGroup.classList.toggle('is-disabled', tool === 'eraser');
}

function setActiveColor(color) {
  activeColor = color;
  for (const swatch of colorSwatches) {
    swatch.classList.toggle('is-active', swatch.dataset.color === color);
  }
}

function setActiveSize(size) {
  activeSize = Number(size);
  for (const swatch of sizeSwatches) {
    swatch.classList.toggle('is-active', Number(swatch.dataset.size) === activeSize);
  }
}

function currentDockPosition() {
  return DOCK_POSITIONS.find((pos) => dock.classList.contains(`dock-${pos}`)) || 'bottom';
}

function setDockPosition(pos) {
  const next = DOCK_POSITIONS.includes(pos) ? pos : 'bottom';
  for (const p of DOCK_POSITIONS) {
    dock.classList.toggle(`dock-${p}`, p === next);
  }
  try {
    localStorage.setItem(DOCK_POS_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  if (dockPosBtn) {
    dockPosBtn.title = `Move toolbar — currently ${next} (cycles bottom → left → top → right)`;
    dockPosBtn.setAttribute('aria-label', `Move toolbar, currently ${next}`);
  }
}

function cycleDockPosition() {
  const idx = DOCK_POSITIONS.indexOf(currentDockPosition());
  const next = DOCK_POSITIONS[(idx + 1) % DOCK_POSITIONS.length];
  setDockPosition(next);
}

function loadDockPosition() {
  let saved = 'bottom';
  try {
    saved = localStorage.getItem(DOCK_POS_KEY) || 'bottom';
  } catch {
    /* ignore */
  }
  setDockPosition(saved);
}

function screenPos(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function worldPos(e) {
  const [sx, sy] = screenPos(e);
  return screenToWorld(sx, sy);
}

function clearBoardLocal() {
  strokeHistory = [];
  remoteStrokes.clear();
  localStrokePoints = [];
  drawing = false;
  strokeId = null;
  lastPoint = null;
  redrawAll();
}

function applyHistory(strokes) {
  strokeHistory = (strokes || []).map(cloneStroke);
  remoteStrokes.clear();
  localStrokePoints = [];
  drawing = false;
  strokeId = null;
  lastPoint = null;
  pendingPoints = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  redrawAll();
}

function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

function requestUndo() {
  if (drawing) {
    drawing = false;
    pendingPoints = [];
    localStrokePoints = [];
    strokeId = null;
    lastPoint = null;
    drawPointerId = null;
    usingPen = false;
  }
  send({ type: 'undo' });
}

function requestRedo() {
  send({ type: 'redo' });
}

function commitStroke(stroke) {
  strokeHistory.push(cloneStroke(stroke));
}

function flushMoves() {
  if (!strokeId || pendingPoints.length === 0) return;
  const points = pendingPoints;
  pendingPoints = [];
  send({ type: 'stroke-move', id: strokeId, points });
}

function scheduleFlush() {
  if (flushTimer) return;
  const delay = usingPen || pendingPoints.length >= 6 ? 8 : 16;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushMoves();
  }, delay);
}

function eventWorldPos(e) {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  return screenToWorld(sx, sy);
}

function appendDrawPoint(x, y) {
  applyCamera();
  if (lastPoint) {
    drawSegment(
      lastPoint[0],
      lastPoint[1],
      x,
      y,
      currentStrokeTool,
      currentStrokeColor,
      currentStrokeWidth,
    );
  } else {
    drawStrokePoints(
      [[x, y]],
      currentStrokeTool,
      currentStrokeColor,
      currentStrokeWidth,
    );
  }
  lastPoint = [x, y];
  localStrokePoints.push([x, y]);
  pendingPoints.push([x, y]);
}

function handleRemote(msg) {
  switch (msg.type) {
    case 'init':
      strokeHistory = (msg.strokes || []).map(cloneStroke);
      remoteStrokes.clear();
      localStrokePoints = [];
      redrawAll();
      break;
    case 'stroke-start': {
      const tool = msg.tool === 'eraser' ? 'eraser' : 'pen';
      const color = msg.color || DEFAULT_COLOR;
      const size = msg.size ?? DEFAULT_SIZE;
      const width = resolveWidth(tool, size);
      remoteStrokes.set(msg.id, { points: [[msg.x, msg.y]], tool, color, size, width });
      applyCamera();
      drawStrokePoints([[msg.x, msg.y]], tool, color, width);
      break;
    }
    case 'stroke-move': {
      const entry = remoteStrokes.get(msg.id) || {
        points: [],
        tool: 'pen',
        color: DEFAULT_COLOR,
        size: DEFAULT_SIZE,
        width: DEFAULT_SIZE,
      };
      const incoming = msg.points || [];
      const { points: pts, tool, color, width } = entry;
      applyCamera();
      if (pts.length && incoming.length) {
        const last = pts[pts.length - 1];
        drawSegment(
          last[0],
          last[1],
          incoming[0][0],
          incoming[0][1],
          tool,
          color,
          width,
        );
      }
      for (let i = 1; i < incoming.length; i++) {
        drawSegment(
          incoming[i - 1][0],
          incoming[i - 1][1],
          incoming[i][0],
          incoming[i][1],
          tool,
          color,
          width,
        );
      }
      remoteStrokes.set(msg.id, {
        points: pts.concat(incoming),
        tool,
        color,
        size: entry.size,
        width,
      });
      break;
    }
    case 'stroke-end': {
      const entry = remoteStrokes.get(msg.id);
      if (entry) {
        commitStroke({
          id: msg.id,
          tool: entry.tool,
          color: entry.color,
          size: entry.size,
          width: entry.width,
          points: entry.points,
        });
        remoteStrokes.delete(msg.id);
      }
      break;
    }
    case 'clear':
      clearBoardLocal();
      break;
    case 'history':
      applyHistory(msg.strokes);
      break;
    default:
      break;
  }
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener('open', () => {
    setStatus('live', 'live');
    reconnectDelay = 500;
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleRemote(msg);
  });

  ws.addEventListener('close', () => {
    setStatus('reconnecting…', 'down');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 5000);
  });
}

function shouldPan(e) {
  return e.button === 1 || (e.button === 0 && spaceDown);
}

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const [sx, sy] = screenPos(e);

    // Trackpad pinch (and ctrl+wheel) → zoom toward cursor
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01);
      setZoomAt(zoom * factor, sx, sy);
      return;
    }

    // Two-finger scroll → pan
    panX -= e.deltaX;
    panY -= e.deltaY;
    redrawAll();
  },
  { passive: false },
);

window.addEventListener(
  'keydown',
  (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      spaceDown = true;
      updateCursor();
      return;
    }

    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    if (e.code === 'KeyZ' && e.shiftKey) {
      e.preventDefault();
      requestRedo();
      return;
    }
    if (e.code === 'KeyZ') {
      e.preventDefault();
      requestUndo();
      return;
    }
    if (e.code === 'KeyY') {
      e.preventDefault();
      requestRedo();
    }
  },
  true,
);

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceDown = false;
    updateCursor();
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (shouldPan(e)) {
    e.preventDefault();
    panning = true;
    panPointerId = e.pointerId;
    lastPanScreen = screenPos(e);
    canvas.setPointerCapture(e.pointerId);
    updateCursor();
    return;
  }

  if (e.button !== 0 || spaceDown) return;
  // Ignore extra fingers while a stroke is already in progress
  if (drawing) return;

  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  drawing = true;
  drawPointerId = e.pointerId;
  usingPen = e.pointerType === 'pen';
  strokeId = crypto.randomUUID();
  currentStrokeTool = activeTool;
  currentStrokeColor = activeColor;
  currentStrokeSize = activeSize;
  currentStrokeWidth = resolveWidth(activeTool, activeSize);
  const [x, y] = eventWorldPos(e);
  pendingPoints = [];
  localStrokePoints = [[x, y]];
  lastPoint = [x, y];
  const startMsg = {
    type: 'stroke-start',
    id: strokeId,
    x,
    y,
    tool: currentStrokeTool,
    size: currentStrokeSize,
  };
  if (currentStrokeTool === 'pen') {
    startMsg.color = currentStrokeColor;
  }
  send(startMsg);
  applyCamera();
  drawStrokePoints(
    [[x, y]],
    currentStrokeTool,
    currentStrokeColor,
    currentStrokeWidth,
  );
});

canvas.addEventListener('pointermove', (e) => {
  if (panning && e.pointerId === panPointerId) {
    e.preventDefault();
    const [sx, sy] = screenPos(e);
    const [lx, ly] = lastPanScreen;
    panX += sx - lx;
    panY += sy - ly;
    lastPanScreen = [sx, sy];
    redrawAll();
    return;
  }

  if (!drawing || e.pointerId !== drawPointerId) return;
  e.preventDefault();

  const samples =
    typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length
      ? e.getCoalescedEvents()
      : [e];

  for (const sample of samples) {
    const [x, y] = eventWorldPos(sample);
    appendDrawPoint(x, y);
  }

  scheduleFlush();
});

function endStroke(e) {
  if (panning && e.pointerId === panPointerId) {
    panning = false;
    panPointerId = null;
    lastPanScreen = null;
    updateCursor();
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    return;
  }

  if (!drawing || (e.pointerId != null && e.pointerId !== drawPointerId)) return;
  drawing = false;
  flushMoves();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const finishedId = strokeId;
  send({ type: 'stroke-end', id: finishedId });
  commitStroke({
    id: finishedId,
    tool: currentStrokeTool,
    color: currentStrokeColor,
    size: currentStrokeSize,
    width: currentStrokeWidth,
    points: localStrokePoints,
  });
  localStrokePoints = [];
  strokeId = null;
  lastPoint = null;
  drawPointerId = null;
  usingPen = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

penBtn.addEventListener('click', () => setActiveTool('pen'));
eraserBtn.addEventListener('click', () => setActiveTool('eraser'));

for (const swatch of colorSwatches) {
  swatch.addEventListener('click', () => {
    setActiveColor(swatch.dataset.color);
    setActiveTool('pen');
  });
}

for (const swatch of sizeSwatches) {
  swatch.addEventListener('click', () => {
    setActiveSize(swatch.dataset.size);
  });
}

undoBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  requestUndo();
});
redoBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  requestRedo();
});

clearBtn.addEventListener('click', () => {
  send({ type: 'clear' });
});

dockPosBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  cycleDockPosition();
});

window.addEventListener('resize', resize);

// Start centered at origin
{
  const { w, h } = screenSize();
  panX = w / 2;
  panY = h / 2;
}
loadDockPosition();
resize();
connect();
