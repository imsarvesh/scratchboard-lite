# Image Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collaborative clipboard image paste with Alt-select drag/resize/delete and full undo/redo.

**Architecture:** Extend `Board` with an `images` map and `image-add` / `image-update` / `image-remove` protocol messages. Client pastes data URLs, renders images under strokes, and gates pointer interaction behind Alt/Option.

**Tech Stack:** Node 18+, `ws`, plain canvas/`app.js`, `node:test`.

## Global Constraints

- No artificial paste size cap.
- `init` / `history` always include `images` array.
- Image `src` must be a `data:image/` URL.
- Min resize side: 20 world units.
- Default paste fit: max side 400 world units, centered in viewport.

---

### Task 1: Board image model + undo

**Files:**
- Modify: `board.js`
- Modify: `test/board.test.js`

**Interfaces:**
- Produces: `imageAdd({id,src,x,y,w,h})`, `imageUpdate({id,x,y,w,h})`, `imageRemove({id})`, `getImages()`, `getInitMessage()` / `getHistoryMessage()` include `images`

- [ ] **Step 1: Write failing tests** for add/update/remove, validation, clear+images, undo/redo image-add/update/remove, and init includes `images: []`.

- [ ] **Step 2: Run** `node --test test/board.test.js` — expect FAIL (missing APIs / missing `images` on init).

- [ ] **Step 3: Implement** image map, clone helpers, validation (`data:image/` prefix, finite x/y, w/h > 0), undo entries, extend clear/undo/redo/init/history.

- [ ] **Step 4: Run tests** — all PASS. Update any existing init assertions that omit `images`.

- [ ] **Step 5: Commit** `feat: board image objects with undo`

---

### Task 2: Server protocol

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Handle** `image-add`, `image-update`, `image-remove` like strokes (validate via Board; broadcast to others on success).

- [ ] **Step 2: Confirm** `getInitMessage()` / undo `history` already ship images from Task 1.

- [ ] **Step 3: Commit** `feat: broadcast image-add/update/remove`

---

### Task 3: Client paste + render + Alt interact

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html` (bump `app.js?v=`)

**Behavior:**
- Local `boardImages` Map; selected id; Alt tracking
- Paste → data URL → fit → `image-add` + local apply
- `redrawAll` draws images then strokes; selection chrome when selected
- Alt+pointer: hit-test, drag, 4-corner resize; Delete/Backspace removes
- Remote handlers + clear/history/init sync images

- [ ] **Step 1: Implement** helpers (`cloneImage`, `fitPasteSize`, `hitTestImage`, `hitTestHandle`) and paste path.

- [ ] **Step 2: Implement** Alt interaction + delete + redraw + WS handlers.

- [ ] **Step 3: Bump script cache query in `index.html`.

- [ ] **Step 4: Run `npm test` — PASS. Manual smoke: two browsers paste/drag/undo.

- [ ] **Step 5: Commit** `feat: collaborative image paste with Alt manipulators`

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| image-add/update/remove + init images | 1–2 |
| Undo paste/move/resize/delete/clear | 1 |
| Paste Cmd/Ctrl+V centered fit | 3 |
| Alt select/drag/resize, Delete | 3 |
| Draw under strokes, peer sync | 3 |
