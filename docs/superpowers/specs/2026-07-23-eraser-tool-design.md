# Eraser Tool — Design

**Date:** 2026-07-23  
**Status:** Approved (approach 1)  
**Extends:** `2026-07-23-scratchboard-lite-design.md`

## Goal

Add a true eraser (canvas `destination-out`) that syncs live over WebSocket and replays correctly for late joiners via session history.

## Decision

Tag each stroke with `tool: "pen" | "eraser"`. Reuse existing `stroke-start` / `stroke-move` / `stroke-end` flow. No separate erase message types.

## Protocol changes

### `stroke-start`

```json
{ "type": "stroke-start", "id": "<strokeId>", "x": number, "y": number, "tool": "pen" | "eraser" }
```

- `tool` required. Server rejects start if missing or invalid.
- Pen width: `3`. Eraser width: `18`.
- Color for pen remains `#000000`. Eraser ignores color; clients use `globalCompositeOperation = "destination-out"`.

### History stroke shape

```json
{ "id": "...", "tool": "pen" | "eraser", "color": "#000000", "width": 3 | 18, "points": [[x,y], ...] }
```

`init` replays strokes in order; eraser strokes punch through prior ink.

### Unchanged

- `stroke-move`, `stroke-end`, `clear` semantics
- Broadcast rules (stroke events to others; clear to all)
- No auth / single global board

## UI

Toolbar: **Pen** | **Eraser** toggles (default Pen) + existing Clear + status. Active tool is visually indicated. Cursor can stay `crosshair` for both.

## Client drawing

- Pen: `source-over`, black, width 3
- Eraser: `destination-out`, width 18
- Local + remote strokes use the stroke’s `tool` (from message or history)
- Reset composite op after each stroke segment so modes don’t leak

## Server / Board

- `strokeStart` accepts `tool`; stores `tool` + matching default `width`
- `getCompletedStrokes` / `init` include `tool`
- Invalid `tool` → ignore (return false), same as other malformed input

## Out of scope

Adjustable eraser size, soft brush, undo, pressure.

## Success criteria

- Switching to Eraser removes ink under the stroke for the local user and peers live
- Late joiner sees erased regions correctly after `init` replay
- Switching back to Pen draws black ink again
- Clear still empties everything for all clients
