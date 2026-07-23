const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const clearBtn = document.getElementById('clearBtn');

const COLOR = '#000000';
const WIDTH = 3;

let ws = null;
let reconnectDelay = 500;
let drawing = false;
let strokeId = null;
let pendingPoints = [];
let flushTimer = null;
let remoteStrokes = new Map();
let lastPoint = null;

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function setStatus(text) {
  statusEl.textContent = text;
}

function pos(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function drawSegment(x0, y0, x1, y1) {
  ctx.strokeStyle = COLOR;
  ctx.lineWidth = WIDTH;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function drawStrokePoints(points) {
  if (!points || points.length < 2) {
    if (points?.length === 1) {
      ctx.fillStyle = COLOR;
      ctx.beginPath();
      ctx.arc(points[0][0], points[0][1], WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.strokeStyle = COLOR;
  ctx.lineWidth = WIDTH;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.stroke();
}

function clearCanvas() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  remoteStrokes.clear();
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function flushMoves() {
  if (!strokeId || pendingPoints.length === 0) return;
  const points = pendingPoints;
  pendingPoints = [];
  send({ type: 'stroke-move', id: strokeId, points });
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushMoves();
  }, 32);
}

function handleRemote(msg) {
  switch (msg.type) {
    case 'init':
      clearCanvas();
      for (const s of msg.strokes || []) {
        drawStrokePoints(s.points);
      }
      break;
    case 'stroke-start': {
      remoteStrokes.set(msg.id, [[msg.x, msg.y]]);
      drawStrokePoints([[msg.x, msg.y]]);
      break;
    }
    case 'stroke-move': {
      const pts = remoteStrokes.get(msg.id) || [];
      const incoming = msg.points || [];
      if (pts.length && incoming.length) {
        const last = pts[pts.length - 1];
        drawSegment(last[0], last[1], incoming[0][0], incoming[0][1]);
      }
      for (let i = 1; i < incoming.length; i++) {
        drawSegment(
          incoming[i - 1][0],
          incoming[i - 1][1],
          incoming[i][0],
          incoming[i][1],
        );
      }
      remoteStrokes.set(msg.id, pts.concat(incoming));
      break;
    }
    case 'stroke-end':
      remoteStrokes.delete(msg.id);
      break;
    case 'clear':
      clearCanvas();
      break;
    default:
      break;
  }
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener('open', () => {
    setStatus('connected');
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
    setStatus('reconnecting…');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 5000);
  });
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  drawing = true;
  strokeId = crypto.randomUUID();
  const [x, y] = pos(e);
  pendingPoints = [];
  send({ type: 'stroke-start', id: strokeId, x, y });
  drawStrokePoints([[x, y]]);
  lastPoint = [x, y];
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const [x, y] = pos(e);
  if (lastPoint) drawSegment(lastPoint[0], lastPoint[1], x, y);
  lastPoint = [x, y];
  pendingPoints.push([x, y]);
  scheduleFlush();
});

function endStroke(e) {
  if (!drawing) return;
  drawing = false;
  flushMoves();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  send({ type: 'stroke-end', id: strokeId });
  strokeId = null;
  lastPoint = null;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

clearBtn.addEventListener('click', () => {
  send({ type: 'clear' });
});

window.addEventListener('resize', resize);
resize();
connect();
