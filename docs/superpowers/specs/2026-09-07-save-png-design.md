# Save Drawing as PNG — Design

**Date:** 2026-09-07  
**Status:** Approved (approach A — client offscreen canvas)  
**Extends:** `2026-07-23-scratchboard-lite-design.md`

## Goal

Let the user download the current board as a PNG that contains every stroke, cropped to content, independent of the live pan/zoom camera.

## Decision

**Client-only offscreen canvas export.** On Save, gather strokes, compute a content bounding box, render onto a temporary canvas with a paper fill, and trigger a browser download. No WebSocket or server changes.

## Behavior

| Aspect | Choice |
|--------|--------|
| Content | All strokes: completed history + in-progress local + in-progress remote |
| Crop | Tight to stroke bounds (points ± half stroke width), then **48px** padding on each side |
| Background | Solid app paper color `#eef2f6` (matches `--paper`) |
| Excluded | Dotted grid, dock UI, atmosphere overlay |
| Camera | Ignored — export is in world coordinates at 1 unit = 1 pixel |
| Empty board | No download; `alert` that there is nothing to save |
| Filename | `scratchboard-YYYY-MM-DD.png` (local date) |

## UI

- New **Save** button in the dock, placed after **Clear** (same `dock-btn` pattern, download/save icon, `title` / `aria-label`).
- Click runs export immediately (no confirm dialog).

## Client implementation

1. **Gather strokes** from `strokeHistory`, `remoteStrokes`, and (if drawing) the current local stroke.
2. **Bounding box** over all points; expand each point by `width / 2` of that stroke; then add `EXPORT_PADDING` (48).
3. **Offscreen canvas** sized to bbox width × height (clamp max side ≈ 8192 to avoid OOM; if clamped, scale drawing uniformly to fit).
4. Fill with `#eef2f6`, translate so content origin maps correctly, redraw strokes with the same pen/eraser composite rules as the live board (`source-over` / `destination-out`).
5. `canvas.toBlob('image/png')` → object URL → temporary `<a download>` click → revoke URL.

Constants live in `public/app.js` (or a tiny helper if bbox logic is unit-tested):

- `EXPORT_PADDING = 48`
- `EXPORT_PAPER = '#eef2f6'`
- `EXPORT_MAX_SIDE = 8192`

## Server / Board

Unchanged. Save does not persist or broadcast.

## Out of scope

Server-side rendering, clipboard copy, JPEG/WebP, keyboard shortcut, including the grid, viewport-only screenshot.

## Success criteria

- Save downloads a PNG with all ink (and erasures) cropped to content + ~48px margin
- Background matches paper; no grid or chrome
- Pan/zoom of the live view does not change what is exported
- Empty board does not download a file
- Live board camera and drawing state are undisturbed after Save
