# Scratchboard Lite — PWA Installable Shell Design

**Date:** 2026-07-23  
**Status:** Approved

## Goal

Make Scratchboard Lite installable as a Progressive Web App: add-to-home-screen / browser install, standalone window, and a soft Install control in the dock when the browser supports it. Live collaborative drawing remains server-dependent; no offline board or sync.

## Decisions

| Decision | Choice |
|----------|--------|
| PWA scope | Installable app shell only (not offline drawing) |
| Install UX | Soft dock button when `beforeinstallprompt` is available |
| Service worker | Minimal network-only `fetch` (mobile installability); no Cache Storage |
| Offline behavior | Unchanged — UI and WebSocket require the server |
| Icon style | Simple accent-stroke mark on paper background; 192 + 512 PNG |

## Architecture

Keep the existing Node HTTP + WebSocket server. Add client-side PWA pieces only.

| Unit | Responsibility |
|------|----------------|
| `public/manifest.webmanifest` | App identity, display mode, theme colors, icon paths |
| `public/icons/icon-192.png` | Install / home-screen icon (192×192) |
| `public/icons/icon-512.png` | Install / splash icon (512×512) |
| `public/sw.js` | Register lifecycle; `fetch` → network only |
| `public/index.html` | Manifest link, `theme-color`, apple-touch-icon, Install dock control |
| `public/app.js` | SW registration; `beforeinstallprompt` + Install button behavior |
| `public/style.css` | Hide Install by default; match existing `dock-btn` look |
| `server.js` | MIME for `.webmanifest` and `.png` |

WebSocket protocol, board model, and drawing tools are unchanged.

```
Browser (canvas + SW + manifest)
  ←── HTTP static ──→  Node server
  ←── WebSocket ───→  Node board + broadcast
```

## Manifest

- `name`: `Scratchboard`
- `short_name`: `Scratchboard`
- `start_url`: `/`
- `display`: `standalone`
- `background_color`: `#e4ebf3`
- `theme_color`: `#2a6f97`
- `icons`: 192 and 512 PNGs under `/icons/`, `purpose` including `any`

## Service worker

- Scope: `/`
- `install`: `skipWaiting()`
- `activate`: `clients.claim()`
- `fetch`: `event.respondWith(fetch(event.request))` — no caching, no offline fallback

## Dock install UX

1. Add an Install control in the dock (same `dock-btn` pattern as Clear / Move), placed just before the live status indicator.
2. Button is **hidden by default** (`hidden` attribute or CSS).
3. On `beforeinstallprompt`: `preventDefault()`, stash the event, **show** the button.
4. On click: call `prompt()` on the stashed event; after the user chooses, clear the event; hide the button if they accepted.
5. If already in an installed context (`display-mode: standalone`, or equivalent checks), never show the button.
6. iOS Safari does not fire `beforeinstallprompt` — button stays hidden; users install via Share → Add to Home Screen (manifest + apple-touch-icon still apply).
7. No first-visit banners, toasts, or install coachmarks.

## Server MIME

Extend the static MIME map:

- `.webmanifest` → `application/manifest+json`
- `.png` → `image/png`

Existing `Cache-Control: no-store` remains acceptable for this install-only scope.

## Error handling

- SW registration failure: log quietly; app continues as a normal web page (no Install button without criteria).
- `beforeinstallprompt` never fires: button stays hidden (expected on iOS and unsupported browsers).
- Install prompt dismissed: leave button visible until install succeeds or the browser stops offering the event.

## Out of scope

- Offline shell / precache of HTML/CSS/JS
- Offline drawing, local stroke queue, or sync/merge
- Push notifications
- Custom iOS “how to install” coachmark
- Changing the collaborative protocol or board persistence

## Verification

- On Chromium over `http://localhost`: service worker registers; Install appears in the dock when the browser offers install; accepting opens a standalone window without browser chrome.
- Drawing and live sync still require a running server / WebSocket.
- On iOS Safari: app can be added via Share → Add to Home Screen; dock Install button remains hidden.
