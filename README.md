# Scratchboard Lite

One global collaborative scratchboard. No login. Open the URL, draw, everyone sees it.

Installable as a PWA (standalone window). Collaborative drawing still needs the server.

## Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in two browser windows.

On Chromium, use the browser’s install affordance if offered. On iOS Safari, use Share → Add to Home Screen.

Optional: regenerate icon PNGs with `node scripts/render-icons.mjs` (also auto-created on server start if missing).

## Test

```bash
npm test
```
