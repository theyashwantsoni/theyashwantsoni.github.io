# Snapbooth

A modern, frontend-only photobooth web app. Everything runs in the browser — no backend, no database, no accounts. Your photos never leave your device.

## Features

- Live camera preview via `getUserMedia` (WebRTC)
- 3 / 4 / 6-shot sequences with animated 3-2-1 countdown (pose prompts optional)
- Flash animation + shutter sound on capture (respects reduced motion)
- 8 filters (Original, B&W, Sepia, Bright, Contrast, Sketch, Vintage, Cool) applied live and baked into the final image
- Three layouts: **Strip**, **Grid**, **Polaroid**
- **Theme packs** (Midnight, Neon Arcade, Pastel Party, Retro Film) — UI chrome and strip accents
- **Frame styles** on the final strip (tape, scallop edge, film perf, confetti, wedding corners)
- Front / back camera flip (mobile)
- Optional border + custom caption + **event / branding line**
- **Stickers** on the preview — draggable; baked into PNG / JPEG / share
- **GIF** and **boomerang GIF** from your burst (uses a small encoder loaded from jsDelivr the first time you export a GIF)
- **Web Share**, **copy image**, and **copy booth link** where the browser supports it
- **PWA**: installable-ish manifest + light service worker cache for faster revisits
- Fully responsive (desktop, tablet, mobile)
- Spacebar shortcut to capture

## Project structure

```
photobooth/
├── index.html              # markup & screens
├── styles.css              # themes, layout, motion preferences
├── app.js                  # camera, capture, compositing, GIF, stickers
├── manifest.webmanifest    # PWA metadata
├── sw.js                   # offline shell for static assets
├── .nojekyll               # optional: disables Jekyll on GitHub Pages
└── README.md
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (e.g. `photobooth`).
2. In the repo: **Settings → Pages → Build and deployment → Source**: deploy from branch **main** (or **master**) and folder **`/` (root)** or **`/docs`** if you move files into `docs/`.
3. After the first deploy, your app will be at:

   - **Project site:** `https://<username>.github.io/<repo>/`  
   - **User/org site:** `https://<username>.github.io/` only if this repo is named `<username>.github.io`.

4. **Camera on Pages:** GitHub Pages serves **HTTPS**, which satisfies secure-context rules for `getUserMedia` on modern mobile browsers (iOS Safari needs HTTPS or localhost).

5. **Paths:** This app uses **relative** asset URLs (`./styles.css`, `./app.js`, `./sw.js`). It works on a **subpath** (project Pages) without a build step. Keep `index.html` at the root of the published folder alongside `sw.js` so the service worker scope covers the app.

6. Optional: add a **`.nojekyll`** file in the published root if you ever add paths Jekyll might mistake for templates (not required for the current layout).

## Run locally

Because `getUserMedia` requires a **secure context**, you need to serve the files over `http://localhost` (or `https://`) — opening `index.html` via `file://` will work for the UI but the browser will refuse camera access.

### Option 1 — Python (no install if Python is on your PATH)

```bash
cd photobooth
python -m http.server 5173
```

Then open http://localhost:5173

### Option 2 — Node

```bash
cd photobooth
npx --yes serve -l 5173 .
```

### Option 3 — VS Code

Install the **Live Server** extension, right-click `index.html` → "Open with Live Server".

## Browser support

**Primary targets:** current **Google Chrome** and **Mozilla Firefox** on desktop (where this app is mainly tested).

Safari (14+) and Edge generally work too. On iOS Safari, the camera needs **HTTPS** (or localhost) plus a tap on **Start Session**. **GIF export** loads the encoder from jsDelivr the first time you use it (works in Chrome and Firefox with a network allowlist if you use strict blocking).

**Chrome tip:** if the tab has been in the background a long time, click the preview once before capturing so the camera pipeline wakes up. **Firefox tip:** if a site was denied camera earlier, use the lock icon in the address bar → Permissions → Camera → Allow, then reload.

## Keyboard shortcuts

| Key     | Action              |
|---------|---------------------|
| `Space` | Start capture burst |

## Privacy

All photo processing happens client-side. The **GIF** button loads the `gifenc` encoder module from the **jsDelivr** CDN the first time you use it (JavaScript only — your images are not uploaded). Everything else, including PNG/JPEG export and stickers, runs locally via the Canvas API.
