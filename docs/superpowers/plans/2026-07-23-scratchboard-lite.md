# Scratchboard Lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-global-board collaborative scratchboard with live WebSocket strokes, in-memory history for late joiners, black pen, and clear-all.

**Architecture:** One Node process serves `public/` over HTTP and upgrades to WebSocket. A small `Board` module owns completed + in-progress strokes. The browser draws on a full-viewport canvas, streams stroke events, and replays `init` history.

**Tech Stack:** Node.js (built-in `http`, `node:test`), `ws`, plain HTML/CSS/Canvas JS.

## Global Constraints

- No auth, no rooms — single global board
- Session memory only (RAM); restart clears the board
- Black pen `#000000`, width `3` (fixed)
- Protocol message types: `stroke-start`, `stroke-move`, `stroke-end`, `clear`, `init`
- Malformed messages are ignored
- No colors UI, eraser, undo, or persistence

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Scripts + `ws` dependency |
| `board.js` | In-memory stroke history / in-progress buffers |
| `server.js` | HTTP static + WebSocket wiring |
| `public/index.html` | Canvas page shell |
| `public/style.css` | Layout |
| `public/app.js` | Drawing + WS client |
| `test/board.test.js` | Unit tests for `Board` |
| `README.md` | How to run |

---

### Task 1: Board module (history + clear)

**Files:**
- Create: `package.json`
- Create: `board.js`
- Create: `test/board.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `class Board`
  - `handleMessage(msg) → { broadcast: object | null, reply: object | null }` — for client messages; `reply` unused except tests may ignore
  - Actually prefer explicit methods:
    - `getInitMessage() → { type: 'init', strokes: Stroke[] }`
    - `strokeStart({ id, x, y }) → boolean` (false if invalid)
    - `strokeMove({ id, points }) → boolean`
    - `strokeEnd({ id }) → boolean`
    - `clear() → void`
    - `getCompletedStrokes() → Stroke[]` (for tests)
  - Stroke shape: `{ id: string, color: '#000000', width: 3, points: number[][] }`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "scratchboard-lite",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Write failing tests for Board**

Create `test/board.test.js`:

```js
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
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm test`  
Expected: FAIL (cannot find module `../board.js` or `Board` not exported)

- [ ] **Step 4: Implement Board**

Create `board.js`:

```js
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
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm install && npm test`  
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json board.js test/board.test.js
git commit -m "feat: add in-memory Board with stroke history"
```

---

### Task 2: HTTP + WebSocket server

**Files:**
- Create: `server.js`

**Interfaces:**
- Consumes: `Board` from `./board.js`; `WebSocketServer` from `ws`; Node `http`, `fs`, `path`, `url`
- Produces: process listening on `PORT` (default `3000`); static files from `public/`; WS on same port
- On connection: send `JSON.stringify(board.getInitMessage())`
- On message: parse JSON; switch on `type`:
  - `stroke-start` / `stroke-move` / `stroke-end`: call Board method; if true, broadcast raw message to all *other* clients
  - `clear`: `board.clear()`; broadcast `{ type: 'clear' }` to *all* clients (including sender)
  - else / parse error: ignore
- MIME: `.html` → `text/html`, `.js` → `text/javascript`, `.css` → `text/css`, default `application/octet-stream`
- Root `/` → `public/index.html`

- [ ] **Step 1: Implement server.js**

```js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Board } from './board.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const board = new Board();

function sendJson(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(wss, data, { except = null, includeSender = false } = {}) {
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    if (!includeSender && client === except) continue;
    client.send(data);
  }
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!resolved.startsWith(PUBLIC_DIR)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url || '/');
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  sendJson(ws, board.getInitMessage());

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'stroke-start': {
        const ok = board.strokeStart({ id: msg.id, x: msg.x, y: msg.y });
        if (ok) broadcast(wss, JSON.stringify(msg), { except: ws });
        break;
      }
      case 'stroke-move': {
        const ok = board.strokeMove({ id: msg.id, points: msg.points });
        if (ok) broadcast(wss, JSON.stringify(msg), { except: ws });
        break;
      }
      case 'stroke-end': {
        const ok = board.strokeEnd({ id: msg.id });
        if (ok) broadcast(wss, JSON.stringify(msg), { except: ws });
        break;
      }
      case 'clear': {
        board.clear();
        broadcast(wss, JSON.stringify({ type: 'clear' }), { includeSender: true });
        break;
      }
      default:
        break;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Scratchboard lite at http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Smoke-check server starts (public missing is OK for now)**

Run: `node -e "import('./server.js')" &` then hit Ctrl+C, or briefly:

```bash
node server.js &
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
kill %1
```

Expected: `404` until Task 3 adds `public/index.html`, or `200` if already present. Process must print the listen URL without crashing.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add HTTP and WebSocket server"
```

---

### Task 3: Frontend (canvas + live sync)

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`
- Create: `README.md`

**Interfaces:**
- Consumes: WS protocol from Task 2
- Produces: drawable UI; reconnect with exponential backoff (cap ~5s); status text `connected` / `reconnecting…`
- Local drawing paints immediately; remote events paint from protocol
- Clear button sends `{ type: 'clear' }`
- Stroke ids: `crypto.randomUUID()`
- Batch move points: accumulate on pointermove, flush every ~32ms or on pointerup

- [ ] **Step 1: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Scratchboard Lite</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header class="toolbar">
      <h1>Scratchboard Lite</h1>
      <span id="status" class="status">connecting…</span>
      <button type="button" id="clearBtn">Clear</button>
    </header>
    <canvas id="board"></canvas>
    <script type="module" src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create public/style.css**

```css
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  background: #e8e4dc;
  color: #1a1a1a;
}

.toolbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  background: rgba(232, 228, 220, 0.92);
  border-bottom: 1px solid #c9c2b4;
}

.toolbar h1 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.status {
  font-size: 0.85rem;
  opacity: 0.7;
  margin-right: auto;
}

#clearBtn {
  font: inherit;
  padding: 0.35rem 0.75rem;
  border: 1px solid #8a8274;
  background: #f5f2eb;
  cursor: pointer;
}

#clearBtn:hover {
  background: #fff;
}

#board {
  display: block;
  width: 100vw;
  height: 100vh;
  touch-action: none;
  cursor: crosshair;
  background: #faf8f4;
}
```

- [ ] **Step 3: Create public/app.js**

```js
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

function resize() {
  const prev = ctx.getImageData(0, 0, canvas.width || 1, canvas.height || 1);
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  try {
    ctx.putImageData(prev, 0, 0);
  } catch {
    /* ignore size mismatch on first resize */
  }
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  canvas._last = [x, y];
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const [x, y] = pos(e);
  const last = canvas._last;
  if (last) drawSegment(last[0], last[1], x, y);
  canvas._last = [x, y];
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
  canvas._last = null;
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
```

Note on resize: wiping/redraw from server history is not required for lite; simple resize that may lose pixels on resize is acceptable. Prefer this simpler resize instead if `putImageData` is flaky:

```js
function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
```

Use the simpler `resize` in the implementation (spec allows lite tradeoffs). After resize, strokes may look cleared locally until reconnect — acceptable; do not overbuild.

- [ ] **Step 4: Create README.md**

```md
# Scratchboard Lite

One global collaborative scratchboard. No login. Open the URL, draw, everyone sees it.

## Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in two browser windows.

## Test

```bash
npm test
```
```

- [ ] **Step 5: Manual verification**

Run: `npm start`  
Then:

1. Open two windows to `http://localhost:3000` — both show `connected`
2. Draw in A — ink appears live in B
3. Open a third window — sees existing strokes
4. Click Clear — all windows go blank
5. Stop server, restart — board empty

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/style.css public/app.js README.md
git commit -m "feat: add canvas client with live stroke sync"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Single global board, no auth | Task 2 |
| In-memory history + init on connect | Task 1 + 2 |
| Live stroke streaming | Task 2 + 3 |
| Black pen + clear for everyone | Task 1 + 3 |
| Reconnect + status | Task 3 |
| Malformed ignored | Task 2 |
| Restart clears board | Task 1/2 (no persistence) |

No placeholders left. Method names consistent: `strokeStart` / `strokeMove` / `strokeEnd` / `clear` / `getInitMessage`.
