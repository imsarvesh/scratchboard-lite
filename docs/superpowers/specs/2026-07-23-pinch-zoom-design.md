# Pinch & Zoom — Design

**Date:** 2026-07-23  
**Status:** Approved  
**Extends:** `2026-07-23-scratchboard-lite-design.md`

## Goal

Add two-finger touch pinch-to-zoom (with pan) and make plain mouse-wheel zoom toward the cursor, while preserving trackpad two-finger scroll pan via a wheel heuristic. Reuse the existing camera model (`zoom`, `panX`, `panY`, `setZoomAt`).

## Decision

**Approach 1 — Pointer-events pinch + wheel heuristic.** Track active touch pointers in the existing pointer handlers. No gesture library, no Safari-only `gesture*` path, no dock zoom UI.

## Behavior

| Input | Result |
|--------|--------|
| Mouse wheel (line/page deltas, or large discrete `deltaY` with near-zero `deltaX`) | Zoom toward cursor |
| Trackpad two-finger scroll (pixel deltas, often with non-zero `deltaX`) | Pan board |
| Ctrl/Cmd + wheel (any device) | Zoom toward cursor |
| Two-finger touch | Pinch: zoom at midpoint + pan as midpoint moves |
| Second touch while drawing | End in-progress stroke cleanly (flush, `stroke-end`, commit), then enter pinch |
| One finger / mouse / pen | Draw as today |
| Space + drag / middle-click drag | Pan as today |

Zoom remains clamped to existing `MIN_ZOOM` (0.25) and `MAX_ZOOM` (4).

## Client implementation

All changes in `public/app.js`.

### Touch pinch

- Maintain a `Map` of active pointers: `pointerId → { x, y, type }`, updated on down/move/up/cancel.
- On second `touch` `pointerdown`:
  - If currently drawing, finish the stroke the same way as a normal pointer-up (flush pending moves, send `stroke-end`, commit to local history). Do not cancel/delete the stroke.
  - Enter pinch mode with the two touch contacts. Capture both pointers while pinching.
- While pinching, on move:
  - Midpoint `(midX, midY)` is the zoom anchor.
  - Scale factor = `newDistance / previousDistance`; call `setZoomAt(zoom * factor, midX, midY)`.
  - Apply midpoint delta to `panX` / `panY` so the gesture pans as well as zooms.
  - Store updated positions and distance for the next move.
- Leave pinch when either finger lifts. A remaining single finger does not resume the previous stroke (user must start a new stroke).
- Non-touch pointers (mouse, pen) are unchanged for drawing; they do not participate in pinch.

### Wheel heuristic

Replace the current “ctrl/meta → zoom, else pan” rule with:

1. If `e.ctrlKey` or `e.metaKey` → zoom toward cursor (unchanged; covers trackpad pinch on macOS).
2. Else if the event looks mouse-like → zoom toward cursor:
   - `deltaMode !== 0` (line or page), **or**
   - `|deltaY| ≥ 40` and `|deltaX| < 1`.
3. Else → pan with `deltaX` / `deltaY` (trackpad-like pixel scroll).

Zoom uses the existing exponential factor style: `Math.exp(-deltaY * k)` (same family as today for ctrl+wheel).

### Unchanged

- Camera math (`screenToWorld`, `applyCamera`, grid, redraw)
- Space / middle-button pan
- Draw protocol (`stroke-start` / `stroke-move` / `stroke-end`)
- Server / Board — no protocol or persistence changes
- No zoom % label / dock zoom controls

## Out of scope

Dock zoom +/- or % UI, keyboard zoom shortcuts, persisting camera across reload, multi-touch drawing, Safari `gesturestart`/`gesturechange` API.

## Success criteria

- Two-finger pinch on a phone/tablet zooms toward the pinch midpoint and pans with midpoint motion
- Starting a pinch mid-stroke leaves the partial stroke committed (visible locally and to peers), then zooms
- Mouse wheel zooms without holding Ctrl/Cmd
- Trackpad two-finger scroll still pans; trackpad pinch (ctrl+wheel) still zooms
- Zoom never goes outside `MIN_ZOOM`…`MAX_ZOOM`
- Single-finger / mouse / pen drawing still works as before
