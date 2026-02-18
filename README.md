# Arya Plank Display

Small static web app that shows Arya's plank history as a cute month calendar plus streak stats.

## Features

- Parses markdown log + status JSON from `openclaw-arya`.
- Generates `public/plank-data.json` for frontend consumption.
- Displays:
  - current streak
  - longest streak
  - total planks
  - calendar-style month view with daily status markers
- Fully static frontend (no backend).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

4. Optional preview of production bundle:

```bash
npm run preview
```

## Data Conversion Flow

`npm run generate:data` runs `scripts/generate-plank-data.mjs`, which:

1. Reads:
   - `plank-log.md`
   - `plank-status.json`
2. Normalizes each day into statuses (`done`, `missed`, `rest`, `pending`, `future`).
3. Computes summary stats:
   - `currentStreak`
   - `longestStreak`
   - `totalPlanks`
4. Writes frontend-ready JSON to:
   - `public/plank-data.json`

The frontend only reads `public/plank-data.json`, so publishing can stay as static assets + generated JSON.

`npm run build` then copies static files into `dist/`:
- `dist/index.html`
- `dist/src/*`
- `dist/plank-data.json`

## Source Directory Resolution

The generator checks these locations (first match wins):

1. `PLANK_SOURCE_DIR` (if set)
2. `../openclaw-arya`
3. `../../openclaw-arya`

In this machine layout, the real source is `/Users/Jacob/openclaw-arya`, which is reached by `../../openclaw-arya` from this repo.

If needed, force the exact source path:

```bash
PLANK_SOURCE_DIR=/Users/Jacob/openclaw-arya npm run generate:data
```
