# Market Atlas

A personal market dashboard demo centered on the Shiller PE ratio by date.

## What it does

- Fetches Robert Shiller's public `ie_data.xls` workbook server-side.
- Parses the CAPE/Shiller PE time series into a local dashboard model.
- Shows a date-selectable CAPE chart, valuation band, percentile, 10-year average, S&P composite level, earnings, and 10-year Treasury rate.
- Exposes the live cleaned data at `/api/shiller`.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Verify

```bash
npm test
npm run build
```
