# Market Atlas

A personal market dashboard for Shiller PE, the Buffett indicator, SPX weekday performance, and realized one-year-ahead forward PE. The site is built entirely from static data committed to this repository and refreshed by GitHub Actions.

## What it does

- Renders valuation and market-research dashboards for CAPE, Buffett indicator, and SPX weekday behavior.
- Compares realized one-year-ahead forward PE with the SPX price.
- Generates datasets from the Shiller workbook, FRED, Nasdaq, World Bank, and Yahoo Finance.
- Validates every generated dataset with Zod L3 checks covering schema shape and sanity bounds.
- Publishes source freshness, row counts, errors, and downloads through the `/data` page and `public/data/manifest.json`.
- Preserves the last valid committed snapshot when an upstream source fails and marks that source `stale`.

## Run locally

```bash
npm install
npm run dev
npm run generate:pages-data
```

`npm run dev` uses the committed `public/data/*.json` files. Run the generator only when you want to refresh them from live sources.

## Verify

```bash
npm test
npm run build:pages
npm run test:static
```

## Architecture

- `scripts/generate-pages-data.mjs` fetches and validates every source through `lib/generate-static-data.ts`.
- `public/data/manifest.json` records per-source freshness and validation status.
- The deployed GitHub Pages site contains static HTML, CSS, JavaScript, and JSON only. It has no runtime API or database.
- Scheduled GitHub Actions runs regenerate, test, smoke-check, deploy, and auto-commit validated data updates to `main`.

## Refresh operations

- Scheduled refreshes target 7:30 p.m. America/Chicago on weekdays after the U.S. market close.
- Two UTC cron entries cover daylight-saving time; a timezone guard runs only the matching schedule. The other scheduled run exits successfully without building.
- Validated data is committed with `[skip ci]` before the verified artifact is deployed.
- A failed data push fails the workflow instead of reporting a successful update that did not reach `main`.

## Delivery roadmap

1. Static-export foundation: complete.
2. Chart-layer replacement: next; scope the chart library and migration in a separate design and implementation plan.
3. Information architecture and home-page redesign.
4. Interaction polish, including URL state, keyboard controls, and downloads.
5. Deeper SPX weekday statistics and distribution analysis.
6. Maintainability and CI improvements, including CSS modularization and browser-quality checks.

Each roadmap item is intentionally handled as its own sub-project so infrastructure, visualization, and interaction changes remain reviewable.

## Data sources

| Dataset | Sources |
|---|---|
| Shiller CAPE | Shiller/Yale workbook, FRED S&P 500, Nasdaq SPY OHLC |
| Buffett indicator | FRED equity market value, U.S. GDP, World GDP, World Bank market capitalization |
| SPX weekdays | Yahoo Finance `^GSPC` daily history |

The deployed `/data` page contains direct source links, current status, and JSON downloads.
