# App Icon Refresh — Design

**Date:** 2026-07-23  
**Status:** Approved (concept C)

## Goal

Replace the thin scribble app icon with a stronger, favicon-readable mark while keeping the same metaphor (drawing stroke + tip) and brand colors.

## Decision

**Concept C — single confident brush gesture.** Bold teal stroke on paper with amber tip circle. No board tile, monogram, or grid.

## Visual

| Token | Value |
|--------|--------|
| Paper | `#e4ebf3` |
| Ink | `#2a6f97` |
| Tip | `#d68910` |

Composition: one sweeping stroke with rounded caps; amber disc at the stroke end. Safe padding for maskable PNGs via existing `icons.js` pad settings.

## Deliverables

- `public/icons/icon.svg` — master 512 SVG
- `public/icons/favicon.svg` — 32px rounded variant
- Regenerated PNGs via `npm run icons` / `ensurePwaIcons` (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`, `favicon-32`)
- `icons.js` procedural fallback (`markPoints` / stroke width) matches concept C

## Unchanged

Manifest name, `theme_color`, `background_color`.
