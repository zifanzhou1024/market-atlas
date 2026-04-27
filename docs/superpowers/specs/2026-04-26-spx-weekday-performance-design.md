# SPX Weekday Performance Design

## Goal

Create a third Market Atlas subpage for S&P 500 weekday performance. The page should help compare how SPX has performed on Monday through Friday across multiple time windows, using both intraday and overnight-aware return methods.

The feature will also introduce the first local market-data database for the site. SPX data moves into SQLite in this pass. CAPE and Buffett data remain on their existing fetch paths for now, but the database boundaries should be designed so those pages can migrate later without rethinking the storage model.

## Approved Direction

Use a local SQLite market-data cache for SPX daily OHLC data. Fetch from a free public source, store the normalized observations locally, and serve the weekday study from the database instead of refetching the internet source for each chart load.

This is Approach A now, with the storage model prepared for Approach C later:

- Implement SPX storage and analytics now.
- Add shared source/refresh metadata now.
- Keep CAPE and Buffett behavior stable now.
- Rewrite CAPE and Buffett to use the database in a later pass.

## Route And User Experience

Add a new subpage at `/spx-weekdays`.

The page uses the Research Dashboard structure selected during brainstorming:

- Top navigation consistent with Dashboard, CAPE chart, and Buffett indicator pages.
- Intro section with a concise description and current selected result.
- Range controls:
  - `1M`
  - `3M`
  - `6M`
  - `1Y`
  - `2Y`
  - `5Y`
  - `10Y`
  - `Since 1993`
- Method toggle:
  - `Open to close`: same trading date open-to-close return.
  - `Close to close`: previous trading date close to current trading date close.
- Weekday summary chart comparing Monday through Friday.
- Cumulative weekday-return line chart similar to the provided reference image.
- Stat cards for selected range and method.
- Source/freshness note showing local database latest date, source URL, and last refresh time.

## Data Source

Use the free public Stooq daily CSV for SPX, targeting the `^SPX` symbol:

```text
https://stooq.com/q/d/l/?s=%5Espx&i=d
```

The ingestion layer should normalize:

- date
- open
- high
- low
- close
- volume if present

Only rows from `1993-01-01` onward are required. The implementation may fetch a full CSV and upsert all rows, but the repository interface should leave room for incremental refresh later.

## Database Design

Use a local SQLite database for market data at `data/market-atlas.sqlite`. The generated database file should not be committed unless a later deployment decision explicitly calls for a seed snapshot.

Use Node's built-in `node:sqlite` adapter for the first pass to avoid adding a package dependency. API routes that access SQLite should pin the Next.js runtime to Node.js. If implementation proves that `node:sqlite` cannot build or run cleanly in this app, pause and revise the implementation plan before adding a third-party SQLite package.

Initial tables:

### `data_sources`

Tracks external data sources used by the site.

Required fields:

- source key
- display name
- source URL
- provider name
- enabled flag
- created timestamp
- updated timestamp

### `refresh_runs`

Tracks refresh attempts and outcomes.

Required fields:

- source key
- started timestamp
- finished timestamp
- status
- rows fetched
- rows inserted or updated
- error message when refresh fails

### `spx_daily_prices`

Stores normalized SPX OHLC observations.

Required fields:

- date as primary key
- open
- high
- low
- close
- volume nullable
- source key
- fetched timestamp

Reserved future table groups:

- Shiller/CAPE source observations.
- FRED observations used by Buffett indicator.
- World Bank observations used by global market-cap modes.

These future tables are not implemented in this pass, but the current source and refresh metadata should support them.

## Data Access Boundaries

Create a small market-data layer rather than letting API routes talk directly to SQLite.

Recommended modules:

- `lib/market-data/db.ts`: database connection, schema initialization, and low-level SQL helpers.
- `lib/market-data/sources.ts`: source registry and refresh metadata helpers.
- `lib/market-data/spx-repository.ts`: SPX-specific read/write operations.
- `lib/spx-source.ts`: Stooq fetch and CSV parse logic.
- `lib/spx-weekdays.ts`: return calculations and chart dataset builders.

The API route calls repository and analytics functions. React components receive already-shaped datasets.

## Analytics

Support two return methods.

### Open To Close

For each trading day:

```text
(close - open) / open
```

The weekday group is the weekday of the trading date.

### Close To Close

For each trading day with an available previous trading close:

```text
(current close - previous trading close) / previous trading close
```

The weekday group is the weekday of the current trading date.

Missing sessions and holidays should naturally fall out of the ordered trading-day series. Do not assume calendar-day adjacency.

For each method, range, and weekday, compute:

- average daily return
- cumulative return series
- total cumulative return
- win rate
- sample count
- best single day
- worst single day

## Chart Design

Use consistent weekday colors across both charts:

- Monday
- Tuesday
- Wednesday
- Thursday
- Friday

The summary chart should make weekday comparison quick to scan. A bar chart is the default unless implementation finds a stronger fit inside the existing visual system.

The cumulative chart should mimic the analytical idea of the reference image: five lines, one per weekday, showing cumulative return by time. It should use Market Atlas styling rather than copying the visual style of the image.

Hover/readout behavior should not block the chart. Prefer a compact top-right or top-inline readout instead of a dark tooltip over the plotting area.

## API Design

Add `GET /api/spx-weekdays`.

Expected query parameters:

- `range`: one of `1m`, `3m`, `6m`, `1y`, `2y`, `5y`, `10y`, `all`
- `method`: one of `openClose`, `closeClose`

Response includes:

- selected range
- selected method
- summary chart points
- cumulative chart series
- weekday stats
- source metadata
- local database metadata
- fetched/refreshed timestamps

The endpoint should ensure the local database is initialized and populated before returning data. If refresh fails but usable cached rows exist, return cached data with a warning metadata field. If no usable cached rows exist, return a clear `502` JSON error.

## Error Handling

The app should distinguish:

- source fetch failure
- CSV parse failure
- database initialization failure
- empty or insufficient SPX rows

If a public source fetch fails after prior data exists, the page should still render from cache and show stale-cache metadata. If no data exists, the page should render a useful error state instead of a blank chart.

## Testing

Add focused Vitest coverage for:

- Stooq CSV parsing.
- SPX row normalization.
- SQLite upsert behavior.
- Cache freshness and latest-date detection.
- Range filtering.
- Open-to-close return calculation.
- Close-to-close return calculation.
- Weekday grouping across missing calendar days.
- Cumulative return series generation.
- API response shaping where practical.

Run verification before implementation is considered complete:

- `npm test`
- `npm run build`
- browser QA for `/spx-weekdays`

## Agent Task Breakdown

### Agent 1: Database Layer

Ownership: `lib/market-data/*`, `data/`, migration/init scripts, runtime/database configuration.

- Add a local SQLite adapter for market data.
- Create `data_sources`, `refresh_runs`, and `spx_daily_prices`.
- Add idempotent schema initialization.
- Add cache freshness helpers: latest date, row count, stale/missing detection.
- Keep generated DB files out of git unless a later seed snapshot is explicitly approved.

### Agent 2: SPX Data Ingestion

Ownership: `lib/spx-source.ts`, `lib/market-data/spx-repository.ts`, ingestion tests.

- Fetch free Stooq `^SPX` daily CSV.
- Parse date, open, high, low, close, and volume if available.
- Filter to dates from `1993-01-01`.
- Upsert rows into SQLite.
- Support full refresh now and leave room for incremental refresh later.
- Record source URL, fetched timestamp, row count, and failure state.

### Agent 3: Weekday Analytics

Ownership: `lib/spx-weekdays.ts`, analytics tests.

- Define range presets.
- Implement open-to-close returns.
- Implement previous-close-to-current-close returns.
- Group results by Monday through Friday.
- Compute average return, cumulative return series, total cumulative return, win rate, sample count, best day, and worst day.
- Handle holidays and missing previous closes from the ordered trading-day series.

### Agent 4: API Layer

Ownership: `app/api/spx-weekdays/route.ts`.

- Add endpoint that initializes and refreshes SPX data as needed.
- Accept range and method parameters.
- Return both chart datasets.
- Include source and database metadata.
- Return useful error payloads if source or database work fails.

### Agent 5: SPX Weekday Page

Ownership: `app/spx-weekdays/*`, nav links in existing page files.

- Create `/spx-weekdays`.
- Build the Research Dashboard layout.
- Add range segmented control.
- Add method toggle.
- Add summary weekday performance chart.
- Add cumulative weekday-return line chart.
- Add stat cards and source/freshness note.
- Add navigation links from Dashboard, CAPE chart, and Buffett page.

### Agent 6: Styling And Chart Polish

Ownership: `app/globals.css`, reusable chart helpers if needed.

- Match the existing Market Atlas visual language.
- Make charts readable on desktop and mobile.
- Use consistent weekday colors across both charts.
- Add hover/readout behavior without covering chart data.
- Keep controls focused and close to TradingView-style ergonomics without overbuilding.

### Agent 7: Tests And Verification

Ownership: `tests/spx-*.test.ts`, final QA notes.

- Test parsing, storage, analytics, range filtering, and edge cases.
- Run `npm test`.
- Run `npm run build`.
- Browser-test `/spx-weekdays`.
- Report any remaining limitations around source freshness or deployment persistence.

## Future Pass: CAPE And Buffett Database Migration

Do not implement this in the first SPX pass.

Future work:

- Move Shiller component pulls behind the shared cache interface.
- Store normalized Shiller, FRED, Nasdaq, and World Bank observations.
- Move Buffett component series into database-backed storage.
- Reuse `data_sources` and `refresh_runs`.
- Keep existing chart APIs stable while replacing fetch-on-load behavior.
- Add tests for stale-cache behavior on CAPE and Buffett endpoints.
