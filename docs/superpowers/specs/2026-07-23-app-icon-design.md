# App Icon Refresh — Design

**Date:** 2026-07-23  
**Status:** Approved (concept A)

## Goal

Replace the thin scribble app icon with a stronger, favicon-readable mark while keeping the same metaphor (drawing stroke + tip) and brand colors.

## Decision

**Concept A — bold free scribble**, using the **exact approved concept art** (`icon-concept-a.png`) as `icon-master.png` for all PNG sizes. SVG favicon/app icon paths are redrawn to match that mark (C-curve → arch → amber tip).

## Visual

| Token | Value |
|--------|--------|
| Paper | `#e4ebf3` |
| Ink | `#2a6f97` |
| Tip | `#d68910` |

Source of truth for raster icons: the brainstorming concept A PNG, copied to `public/icons/icon-master.png` and resized by `ensurePwaIcons`.

## Deliverables

- `public/icons/icon-master.png` — approved concept A art (source of truth)
- `public/icons/icon.svg` / `favicon.svg` — reference the raster masters (no hand-traced path drift)
- Regenerated PNGs via `node scripts/sync-concept-a-icon.mjs` or server start (`ensurePwaIcons`)
- `ICON_REVISION` = `5-concept-a-master`

## Unchanged

Manifest name, `theme_color`, `background_color`.
