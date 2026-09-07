# Image Paste — Design

**Date:** 2026-09-07  
**Status:** Approved (approach 1 — first-class board objects)  
**Extends:** `2026-07-23-scratchboard-lite-design.md`

## Goal

Paste clipboard images onto the collaborative board as movable objects: everyone sees them; users can drag, resize, and delete; paste/move/resize/delete participate in the shared undo/redo stack.

## Decisions

| Aspect | Choice |
|--------|--------|
| Model | First-class image objects alongside strokes |
| Sync | WebSocket broadcast; included in `init` / `history` |
| Size limit | None beyond what the browser can paste |
| Formats | Clipboard image types via `data:image/...` data URLs |
| Interaction | Hold **Alt/Option** to select / drag / resize; otherwise draw |
| Undo | Full: paste, move, resize, delete (and clear snapshots images) |
| Placement | Center of current viewport; fitted so max side ≈ 400 world units |
| Clear | Removes strokes and images for everyone |

## Image shape

```json
{
  "id": "<uuid>",
  "src": "data:image/png;base64,...",
  "x": 0,
  "y": 0,
  "w": 200,
  "h": 150
}
```

`x`/`y` are top-left in world coordinates. `w`/`h` are positive world sizes.

## Protocol

### Client → Server

- `{ "type": "image-add", "id", "src", "x", "y", "w", "h" }`
- `{ "type": "image-update", "id", "x", "y", "w", "h" }` (geometry only)
- `{ "type": "image-remove", "id" }`

### Server → Client

- `init` / `history`: `{ "type": "init"|"history", "strokes": Stroke[], "images": Image[] }`
- Broadcast `image-add` / `image-update` / `image-remove` to other clients (same pattern as strokes for add/update; remove to others)
- On successful add/update/remove that affects undo state: sender already applied locally; peers get the event. Undo/redo still use full `history` broadcast to all.

## Board (`board.js`)

- `images: Map<id, Image>`
- `imageAdd` / `imageUpdate` / `imageRemove` with validation
- Undo entries: `{ type: 'image-add', image }`, `{ type: 'image-update', id, before, after }`, `{ type: 'image-remove', image }`
- `clear` snapshots both strokes and images
- Existing stroke tests remain valid; `init`/`history` always include `images` (possibly `[]`)

## Client (`public/app.js`)

1. **Paste:** `paste` on `window`; if clipboard has an image file/blob, read as data URL, compute fitted size, place at viewport center, `image-add`, keep selected.
2. **Render:** draw images under strokes; selection chrome (border + 4 corner handles) when selected and Alt is held or image is being manipulated.
3. **Alt/Option:** while held (or during an in-progress image gesture started with Alt), pointer on image selects; drag body moves; drag handle resizes (min side 20); empty canvas with Alt does nothing (no draw).
4. **Delete / Backspace:** if an image is selected and focus is not in an input, `image-remove`.
5. **Remote:** apply add/update/remove; on `init`/`history` replace image list; clear wipes images.

## Out of scope

File drop, rotate, crop, z-order UI, image compression, dedicated Select tool, touch-specific Alt substitute.

## Success criteria

- Cmd/Ctrl+V pastes a clipboard image; peers see it
- Late joiners receive images in `init`
- Alt+drag moves; Alt+corner handles resize; Delete removes
- Undo/redo reverse paste, move, resize, delete
- Clear removes images for everyone
