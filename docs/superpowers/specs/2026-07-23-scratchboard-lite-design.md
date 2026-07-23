# Scratchboard Lite — Design

**Date:** 2026-07-23  
**Status:** Approved

## Goal

A lightweight collaborative scratchboard: one global board, no login, no rooms. Multiple people draw at once; everyone sees everyone else's strokes in real time over WebSockets.

## Decisions

| Decision | Choice |
|----------|--------|
| Board model | Single global board |
| Auth / joining | None |
| Late joiners | Session memory: server keeps strokes in RAM and sends history on connect; wiped on restart |
| Drawing tools | Black pen + Clear (clears for everyone) |
| Stack | Node HTTP + `ws` + plain HTML/Canvas (lightest) |

## Architecture

One Node process serves static frontend files and a WebSocket endpoint. All clients connect to the same board. Stroke history is an in-memory array on the server.

```
Browser (canvas)  ←──WebSocket──→  Node server (history + broadcast)
Browser (canvas)  ←──WebSocket──→
```

## Components

| Unit | Responsibility |
|------|----------------|
| `server.js` | HTTP static serve + WebSocket; owns stroke history; broadcast |
| `public/index.html` | Full-page canvas, Clear button, connection status |
| `public/app.js` | Pointer drawing, WS send/receive, replay history |
| `public/style.css` | Minimal layout: canvas fills viewport; thin toolbar |

## Protocol

Messages are JSON over WebSocket.

### Client → Server

- `{ "type": "stroke-start", "id": "<strokeId>", "x": number, "y": number }`
- `{ "type": "stroke-move", "id": "<strokeId>", "points": [[x,y], ...] }`
- `{ "type": "stroke-end", "id": "<strokeId>" }`
- `{ "type": "clear" }`

Stroke `id` is a client-generated UUID (or similar) so partial strokes can be correlated while streaming.

Default pen: color `#000000`, width `3` (fixed; not sent per message to keep the protocol small). If needed later, optional `color` / `width` fields may be added without breaking init.

### Server → Client

- On connect: `{ "type": "init", "strokes": Stroke[] }`
- Broadcast (to others, or to all for clear): same stroke events, plus `{ "type": "clear" }`

### Stroke history shape

Completed strokes stored as:

```json
{ "id": "...", "color": "#000000", "width": 3, "points": [[x,y], ...] }
```

In-progress strokes are buffered until `stroke-end`, then appended. On `init`, only completed strokes are sent. Live `stroke-*` events are broadcast immediately so peers see ink while the pointer is down.

## Data flow

1. Client connects → server sends `init` with full completed history.
2. Pointer down → `stroke-start`; moves → batched `stroke-move`; up → `stroke-end`.
3. Server updates in-progress buffer / history and broadcasts to other clients.
4. Clear → server empties history (and in-progress buffers) and broadcasts `clear` to all.

Coordinates are canvas pixel space relative to the local canvas. All clients use a full-viewport canvas; minor size differences across screens are acceptable for this lite version (no coordinate normalization).

## Error handling

- Disconnect: no per-user cleanup beyond dropping the socket.
- Client WS drop: show “reconnecting…”, reconnect with backoff, receive fresh `init` on new connection.
- Malformed messages: ignore.

## Out of scope

Colors, stroke width UI, eraser, undo, persistence, multiple boards, login, mobile-specific gestures beyond basic pointer events.

## Success criteria

- Two browsers open to the same URL see each other's strokes live.
- A third browser joining mid-session sees existing strokes.
- Clear empties the board for everyone.
- Server restart yields an empty board.
