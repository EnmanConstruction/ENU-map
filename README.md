# ENU Citywide Map — Micro App

Static micro‑app for Edmonton Neighbourhoods United.

> Current status: stabilized demonstration using sample data. Figures shown in the app are not yet connected to an official ENU data source.

## MVP features
- ENU presence per neighbourhood (Oilers blue = Yes, Flames red = No)
- Active development permits (mocked for now)
- Ward & Councillor (placeholder until live feed)
- Densification heatmap + infill hotspots (context)
- KPIs aligned to the colors

## Local preview
Run `npm run build`, then serve the generated `dist/` directory with a local web server.

## Project structure
- `index.html` — accessible page structure and external map dependencies
- `styles.css` — layout, responsive design, and visual styling
- `config.js` — public data-source configuration
- `data.js` — demonstration data only; never store confidential information here
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
