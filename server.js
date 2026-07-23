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
  const rel = (decoded === '/' ? 'index.html' : decoded).replace(/^\/+/, '');
  const resolved = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    return null;
  }
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
