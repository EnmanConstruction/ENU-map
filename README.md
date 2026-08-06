# ENU Citywide Map — Micro App

Static micro‑app for Edmonton Neighbourhoods United.

> Current status: citywide City-backed snapshot with ENU coverage awaiting confirmation. City metrics can be refreshed repeatably; ENU-maintained fields can connect to the public Google Sheet workflow.

## MVP features
- All City of Edmonton neighbourhoods with search and ward navigation
- Ranked Top Growth Areas and shareable neighbourhood links
- ENU presence per neighbourhood (Yes, No, or Unknown)
- Active development and new-home permit snapshots
- Current ward and councillor context
- Densification heatmap + infill hotspots (context)
- KPIs aligned to the colors

## Local preview
Run `npm run build`, then serve the generated `dist/` directory with a local web server.

## Automatic City data refresh
The `Refresh City map data` GitHub Actions workflow runs every Sunday and can also be started manually. It downloads the current City datasets, validates the result, updates `data.js` only when values changed, and pushes the verified snapshot to `main` for automatic Vercel deployment. A failed download or validation never replaces the production snapshot.

## Project structure
- `index.html` — accessible page structure and external map dependencies
- `styles.css` — layout, responsive design, and visual styling
- `config.js` — public data-source configuration
- `data.js` — generated public City snapshot plus provisional ENU status; never store confidential information here
- `scripts/build-city-data.mjs` — repeatable City open-data snapshot generator (`npm run data:refresh`)
- `data-loader.js` — CSV parsing, validation, live loading, and fallback handling
- `app.js` — map rendering, filters, scoring, KPIs, and mobile interactions
- `neighbourhoods-template.csv` — import-ready Google Sheets structure
- `DATA_GUIDE.md` — public-sheet setup and privacy rules
- `dist/` — generated deployment output (not committed)

## Deploy to Vercel
1. Create a new project at https://vercel.com/new
2. Import this folder (or push to GitHub then import).
3. Framework: **Other** (static). Build command: `npm run build`. Output: `dist`.
4. Deploy and use the URL in Squarespace via an iframe.

## Production path
Pushes merged to `main` deploy automatically to the existing Vercel project and production alias.
