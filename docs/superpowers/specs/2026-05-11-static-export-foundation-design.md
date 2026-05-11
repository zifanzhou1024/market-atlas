# Static-Export Foundation Design

## Goal

Eliminate the architectural gap between dev and prod that produces:

- A fragile `app/api` rename hack inside `scripts/build-pages.mjs` (the directory is moved out of the tree, `next build` runs, the directory is moved back).
- Broken `/api/shiller` and `/api/buffett` links shown to users on the deployed error states — those routes are stripped from production by the rename hack and never actually serve from GitHub Pages.
- Ambiguous data freshness signals — no canonical place tells users when each underlying source was last successfully fetched.
- An unused SQLite cache layer in `lib/market-data/` whose original purpose was to absorb runtime API traffic that no longer exists.

This is sub-project (1) of a six-sub-project Market Atlas improvement effort. It is the foundation. Later sub-projects (chart-layer replacement, IA redesign, statistical depth, interaction polish, maintainability/CI) build on the manifest, validation, and `/data` route introduced here.

## Approved Direction

Unify around a build-time-generated static-JSON dataset that is committed to the repository and served as-is. Treat the live fetchers as build-time helpers, not runtime API routes. Surface freshness through a single `public/data/manifest.json` rendered by a new `/data` route. Validate every dataset with a Zod L3 schema (types + sanity bounds); when validation or fetching fails for a source, preserve the prior committed JSON and mark the source `stale` rather than failing the deploy.

The deployed site contains:

- HTML, CSS, JS produced by `next build` with `output: "export"` and the GitHub Pages `basePath`.
- `public/data/*.json` and `public/data/manifest.json` copied to `out/data/` by the static export.

The deployed site does not contain:

- Any runtime API route.
- Any SQLite database, runtime cache, or live fetcher reachable from a page.

## Route And User Experience

### Existing pages

Unchanged in this sub-project except for nav and error-state link updates:

- `/` Dashboard
- `/chart` Detailed chart workbench
- `/buffett` Buffett indicator
- `/spx-weekdays` SPX weekday study

Each page's nav swaps the legacy `/#about` anchor for a real `/data` link. Each page's error state, currently linking to `/api/shiller` etc., now links to `/data`.

### New `/data` route

A static-export server page that reads `public/data/manifest.json` at build time and renders:

- Page intro: title, eyebrow, one-sentence description of the data refresh model.
- Build-metadata strip: `generatedAt` formatted, `generatedBy.runUrl` as a link to the workflow run.
- One source card per source (`shiller`, `buffett`, `spxWeekdays`) showing:
  - Display name and status badge (green `ok`, amber `stale`, red `failed`).
  - Last successful fetch timestamp.
  - Last attempted fetch timestamp (shown only when status is not `ok`).
  - Latest data row date plus row count.
  - Compact source host with link to full source URL.
  - Inline download link(s) to the source's JSON file(s).
  - Error message if status is `stale` or `failed`.
- For `spxWeekdays`, the download list is a collapsible `<details>` with all 18 range/method variants.
- Methodology note covering validation tier and preserve-on-failure semantics.

The route uses no client-side JavaScript. The manifest is parsed against `ManifestSchema` at build time; a malformed manifest fails the static export.

## Data Sources

Unchanged from current site. Re-fetched once per CI run via the existing fetcher modules:

- Shiller workbook (`SHILLER_SOURCE_URLS` in `lib/shiller.ts`) + FRED daily S&P 500 + Nasdaq SPY OHLC, merged into a unified `ShillerDataset`.
- FRED equity market value + GDP + World GDP + World Bank world market cap, merged into a `BuffettDataset`.
- Yahoo Finance `^GSPC` daily chart JSON, processed into 18 `SpxWeekdayPayload` variants.

The 6-hour in-memory cache wrappers in `lib/shiller.ts` and `lib/buffett.ts` are removed — under one-fetch-per-build, they hold dead state.

## Build-Time Data Pipeline

```
scripts/generate-pages-data.mjs            (thin entry; CI + local)
  └─ lib/generate-static-data.ts
       For each source in [shiller, buffett, spxWeekdays]:
         1. Try fetch via existing fetcher
         2. Validate with Zod L3 schema
         3. If valid → overwrite public/data/<source>.json
            If invalid or fetch failed → preserve committed file
                                          mark status: "stale" or "failed"
         4. Append source entry to in-memory manifest
       Write public/data/manifest.json
       Exit non-zero only if every source.status === "failed"

scripts/build-pages.mjs                    (CI only)
  └─ spawn next build with GITHUB_PAGES=true
     (rename hack removed; app/api no longer exists)

scripts/test-static-export.ts              (CI: after build, before commit/deploy)
  └─ Verify routes, data files, manifest schema, no /api/ substrings

GitHub Actions auto-commit step            (schedule or workflow_dispatch only)
  └─ git diff --quiet public/data/ || \
       git commit -m "chore(data): refresh YYYY-MM-DD [skip ci]" && git push

upload-pages-artifact + deploy-pages
```

The auto-commit step happens after the smoke test passes; we only commit data that we have proven builds and serves correctly.

## Runtime (Browser)

The browser fetches static JSON directly from the deployed site:

```
GET /market-atlas/data/shiller.json
GET /market-atlas/data/buffett.json
GET /market-atlas/data/spx-weekdays/<range>-<method>.json
GET /market-atlas/data/manifest.json
```

No `/api/*` paths. No fallback fetch logic. No SQLite. No `isStaticExport` branch in `app/spx-weekdays/spx-weekday-dashboard.tsx`.

## Local Development

```
npm run generate:pages-data    # fetch + validate + write public/data
npm run dev                    # next dev reads from public/data
```

`lib/pages-data.ts` collapses to a single `readStaticJson<T>(relativePath)` helper. The `GITHUB_PAGES === "true"` switch is deleted.

## Manifest Schema

`public/data/manifest.json`:

```typescript
type Manifest = {
  schemaVersion: 1;
  generatedAt: string;             // ISO 8601
  generatedBy: {
    ref: string;                   // "refs/heads/main" or "local"
    sha: string | null;            // GITHUB_SHA, null locally
    runId: string | null;          // GITHUB_RUN_ID, null locally
    runUrl: string | null;         // permalink to workflow run, null locally
  };
  validationTier: "L3";
  sources: {
    shiller: SourceStatus;
    buffett: SourceStatus;
    spxWeekdays: SourceStatus;
  };
};

type SourceStatus = {
  displayName: string;
  status: "ok" | "stale" | "failed";
  latestDate: string | null;       // YYYY-MM-DD of latest row in source JSON
  rowCount: number;                // count of points in the source's JSON
  sourceUrl: string;
  lastSuccessfulFetchAt: string | null;  // ISO 8601, may predate generatedAt
  lastAttemptedFetchAt: string;          // ISO 8601, almost always = generatedAt
  errorMessage: string | null;     // populated when status != "ok"
};
```

`spxWeekdays.rowCount` is the underlying daily SPX cache size, not summed across the 18 variants.

`generatedBy.ref` is `"local"` when no `GITHUB_REF` is present. `sha`, `runId`, and `runUrl` are `null` in that case.

The manifest does not include a `downloads` field. The `/data` route hardcodes the download list — it is the same every build, and round-tripping known paths through JSON adds no value.

### Status semantics

| Status | Meaning |
|---|---|
| `ok` | Fresh fetch succeeded; L3 validation passed; JSON overwritten this run. |
| `stale` | Fetch or validation failed; prior committed JSON preserved. |
| `failed` | Fetch or validation failed AND no prior committed JSON existed (build exits 1). |

### `lastSuccessfulFetchAt` across builds

When a source falls back to its committed snapshot, the previous manifest's `lastSuccessfulFetchAt` is preserved on the new manifest. If the previous manifest is missing or unreadable, the field is `null`. This is the only piece of state that needs to survive across builds beyond the dataset files themselves.

## Validation (L3, Zod)

Four schemas live under `lib/schemas/`:

- `manifest.ts` — `ManifestSchema` consumed by `/data` route and smoke test.
- `shiller.ts` — `ShillerDatasetSchema`.
- `buffett.ts` — `BuffettDatasetSchema`.
- `spx-weekdays.ts` — `SpxWeekdayPayloadSchema` applied per variant.

L3 bounds enforced:

- All `date` fields match `/^\d{4}-\d{2}-\d{2}$/`.
- All numbers `.finite()` — rejects `NaN`, `Infinity`, `-Infinity`.
- Within each series, dates monotonically ascending (custom `.refine`).
- `cape > 0 && cape < 200`.
- `price > 0`, `earnings > 0`, `ratio > 0` where present.
- Minimum row counts: shiller `>= 1500`, buffett `>= 200`, spxWeekdays `all` variant `>= 5000`, other variants `length > 0`.

On validation failure, the Zod error is summarized into the first 3 issues joined by `"; "` and written to `manifest.sources[x].errorMessage`. The full Zod error is logged to workflow stderr.

L4 freshness gates (per-source max-lag thresholds) are explicitly deferred. Adding them later does not require schema changes — they are an additional `.refine` per series.

## Error Handling

| # | Failure | Per-source result | Build result |
|---|---|---|---|
| 1 | Source fetch fails (network, 5xx, timeout) | Preserve committed JSON; `status: "stale"`; `errorMessage` = short HTTP/network reason | Continue |
| 2 | Fetch ok, Zod validation fails | Preserve committed JSON; `status: "stale"`; `errorMessage` = compact Zod summary | Continue |
| 3 | (1) or (2), no committed JSON exists | `status: "failed"`; `errorMessage` set | Continue unless every source is `failed` |
| 4 | One spxWeekdays variant invalid | All 18 variants preserved together; `status: "stale"`; error references the failing variant | Continue |
| 5 | Manifest write fails | n/a | Exit 1 |
| 6 | `next build` fails | n/a | Exit 1 |
| 7 | Smoke test fails | n/a | Workflow fails before deploy |
| 8 | Auto-commit `git push` fails | n/a | Log `::warning::`; deploy still runs against `out/`; next run retries |
| 9 | All sources stale, none `ok`, committed JSON exists | Deploy preserved JSON; manifest reflects state | Deploy proceeds; `/data` shows amber across the board |
| 10 | All sources `failed`, no committed JSON anywhere | Bootstrap failure | Exit 1, no deploy |

The validation, preservation, and manifest-construction logic lives in `lib/generate-static-data.ts` and is unit-testable through dependency injection (fetchers and filesystem passed in).

## CI Workflow

`.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: "30 0 * * 2-6"   # 7:30 PM CDT (UTC-5)
    - cron: "30 1 * * 2-6"   # 7:30 PM CST (UTC-6)

permissions:
  contents: write    # was read; needed for auto-commit
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: false

jobs:
  should-deploy:
    runs-on: ubuntu-latest
    outputs:
      run: ${{ steps.schedule-check.outputs.run }}
    steps:
      - id: schedule-check
        shell: bash
        run: |
          if [[ "${{ github.event_name }}" != "schedule" ]]; then
            echo "run=true" >> "$GITHUB_OUTPUT"; exit 0
          fi
          h="$(TZ=America/Chicago date +%H)"
          m="$(TZ=America/Chicago date +%M)"
          [[ "$h" == "19" && "$m" == "30" ]] \
            && echo "run=true" >> "$GITHUB_OUTPUT" \
            || echo "run=false" >> "$GITHUB_OUTPUT"

  build:
    needs: should-deploy
    if: needs.should-deploy.outputs.run == 'true'
    runs-on: ubuntu-latest
    env:
      GITHUB_PAGES: "true"
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Generate + validate static data
        run: npm run generate:pages-data

      - name: Unit tests
        run: npm test

      - uses: actions/configure-pages@v6

      - name: Build static export
        run: npm run build:pages

      - name: Static-export smoke test
        run: npm run test:static

      - name: Auto-commit refreshed data
        if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
        shell: bash
        run: |
          if git diff --quiet public/data/; then
            echo "no data changes — skipping commit"
          else
            git config user.name  "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add public/data/
            git commit -m "chore(data): refresh $(date -u +%Y-%m-%d) [skip ci]"
            git push || echo "::warning::data commit/push failed; site will still deploy"
          fi

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v5
        with:
          path: out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

### Notes on the workflow

- `permissions.contents` flips from `read` to `write` so the auto-commit step can `git push`.
- The default `GITHUB_TOKEN` inherits write access from the workflow `permissions` block — no PAT required.
- `[skip ci]` is recognized natively by GitHub Actions to suppress re-trigger.
- Auto-commit runs on `schedule` or `workflow_dispatch`. A `push` event implies a developer is publishing a code change; an automatic data commit on top would muddy the history.
- If a concurrent `git push` invalidates ours (non-fast-forward), the step logs `::warning::` and the deploy still proceeds with the artifact this run built. The next scheduled run picks up. If this becomes common, add a `git pull --rebase --autostash` retry — held back for now to keep the script simple.
- The `should-deploy` Chicago-19:30 guard is inherited from existing code and unchanged.

## Components And Module Boundaries

### New files

| Path | Purpose |
|---|---|
| `lib/schemas/manifest.ts` | `ManifestSchema` + TS type |
| `lib/schemas/shiller.ts` | `ShillerDatasetSchema` |
| `lib/schemas/buffett.ts` | `BuffettDatasetSchema` |
| `lib/schemas/spx-weekdays.ts` | `SpxWeekdayPayloadSchema` |
| `lib/generate-static-data.ts` | Testable orchestrator with dependency-injected fetchers + filesystem |
| `lib/format.ts` | Shared `formatDateTime`, `formatDay`, `formatMonth`, `formatYear` lifted from existing pages |
| `tests/schemas.test.ts` | Round-trip tests for the four schemas + committed-data validation |
| `tests/generate-static-data.test.ts` | Integration tests for the orchestrator |
| `scripts/test-static-export.ts` | Post-build smoke test |
| `app/data/page.tsx` | Server component for `/data` route |

### Modified files

| Path | Change |
|---|---|
| `scripts/generate-pages-data.mjs` | Becomes thin entry point that calls `generateStaticData` from `lib/generate-static-data.ts` |
| `scripts/build-pages.mjs` | Delete the `app/api` rename hack; reduce to `spawn next build` with `GITHUB_PAGES=true` |
| `package.json` | Add `zod` dependency; add `test:static` script |
| `.github/workflows/deploy-pages.yml` | Permissions, generate step, unit-test step, smoke-test step, auto-commit step |
| `lib/pages-data.ts` | Collapse to single `readStaticJson<T>` path; delete `isGithubPagesBuild` switch |
| `lib/shiller.ts` | Delete the 6-hour in-memory cache wrapper (`cachedDataset` + TTL) |
| `lib/buffett.ts` | Same — delete cache wrapper |
| `app/page.tsx`, `app/chart/page.tsx`, `app/buffett/page.tsx`, `app/spx-weekdays/page.tsx` | Nav `/#about` to `/data`; error-state links from `/api/*` to `/data/*.json` |
| `app/dashboard.tsx`, `app/chart/detailed-chart.tsx`, `app/buffett/buffett-dashboard.tsx` | Nav updates; import `formatDateTime` from `lib/format.ts` |
| `app/spx-weekdays/spx-weekday-dashboard.tsx` | `getSpxWeekdayDataUrl` collapses to static-JSON path; `SourceNote` accepts freshness as a prop from the server page; type changes from `SpxWeekdayPayload` removal of `database` and `warning` |
| `app/globals.css` | New classes for `/data` route — `sourceCard`, `downloadLinks`, `buildMetadataStrip`; active-nav rule |
| `README.md` | Replace `/api/*` references with `/data/*.json`; document `/data` route + manifest |
| `.gitignore` | Remove `data/*.sqlite*` lines |
| `next-env.d.ts` | Reset routes-d-ts path drift (Next regenerates) |

### Deleted files and directories

| Path | Why |
|---|---|
| `app/api/` (whole tree) | No runtime API in static export |
| `lib/market-data/` (whole tree) | SQLite cache eliminated |
| `lib/spx-weekday-service.ts` | SQLite orchestrator replaced by direct fetch in `lib/generate-static-data.ts` |
| `tests/market-data.test.ts` | Tests deleted module |
| `tests/spx-weekday-service.test.ts` | Tests deleted orchestrator |
| `data/` directory and any local `.sqlite*` artifacts | No longer used |

### Module-boundary shape change

Pre-cleanup SPX weekday pipeline:

```
app/api/spx-weekdays/route.ts
    ↓
lib/spx-weekday-service.ts (SQLite orchestration)
    ↓
lib/market-data/* + lib/spx-source.ts + lib/spx-weekdays.ts
```

Post-cleanup:

```
scripts/generate-pages-data.mjs
    ↓
lib/generate-static-data.ts
    ↓
lib/spx-source.ts (fetch + parse) + lib/spx-weekdays.ts (analytics)
    ↓
public/data/spx-weekdays/*.json
    ↓ read at build by
app/spx-weekdays/page.tsx → SpxWeekdayDashboard
```

`lib/spx-source.ts` and `lib/spx-weekdays.ts` are unchanged — only their orchestrator does.

The `SpxWeekdayPayload` type loses `database` and `warning`. The dashboard's `SourceNote` receives source freshness as a separate prop from the server page (which has access to the manifest at build time). No client-side manifest fetch is introduced.

## Testing

### New tests

- `tests/schemas.test.ts` — three describes:
  - Green: each schema accepts an inline valid fixture (for shiller's `>= 1500` row minimum, generate fixture rows programmatically).
  - Red per L3 bound: missing required field, wrong type, out-of-bounds, bad date format, non-monotonic dates, below-minimum row count, `NaN` / `Infinity`.
  - Committed-data validation: for each `public/data/*.json` that exists at test time, assert it parses against its schema. Skips gracefully on fresh checkout.
- `tests/generate-static-data.test.ts` — integration coverage for `generateStaticData({ fetchers, fs, env, priorManifest })`:
  - All sources succeed → all `ok`, JSONs overwritten, manifest valid.
  - One fetcher rejects → that source `stale`, others `ok`, file untouched.
  - One source's response fails Zod → `stale`, file untouched, `errorMessage` populated with compact Zod summary.
  - One source fails with no prior JSON → `failed`.
  - All sources fail with no prior JSON → throws (caller exits 1).
  - `lastSuccessfulFetchAt` preserved from prior manifest when source falls back to stale.
  - One spxWeekdays variant fails → all 18 preserved as a group.
  - `generatedBy` populates from injected env (CI mode) or defaults to `"local"`.

### Smoke test (`scripts/test-static-export.ts`)

Pure Node script, not Vitest. Runs after `npm run build:pages` via `npm run test:static`. Verifies:

1. Required routes exist as files: `out/index.html`, `out/chart/index.html`, `out/buffett/index.html`, `out/spx-weekdays/index.html`, `out/data/index.html`.
2. Required data files exist: `out/data/manifest.json`, `out/data/shiller.json`, `out/data/buffett.json`, all 18 `out/data/spx-weekdays/<range>-<method>.json`.
3. `out/data/manifest.json` parses against `ManifestSchema`.
4. No `"/api/"` or `'/api/'` substrings appear in any `out/**/*.html` file.
5. `out/index.html` contains `/market-atlas/` references confirming the basePath was applied.

Exits 1 on any failure with a pass/fail summary for each check.

### Deleted tests

- `tests/market-data.test.ts`
- `tests/spx-weekday-service.test.ts`

### Updated tests

- `tests/spx-weekday-layout.test.ts` — fixture uses an `SpxWeekdayPayload` shape that includes `database` and `warning`. Update fixture to match the new type; align assertions with the new `SourceNote` prop signature.

### Unchanged tests

`buffett.test.ts`, `chart-viewport.test.ts`, `forward-pe.test.ts`, `market-metrics.test.ts`, `shiller.test.ts`, `spx-source.test.ts`, `spx-weekdays.test.ts`. Pure-function tests; underlying modules unchanged.

### Test commands

```
npm test            # Vitest — schemas, generate-static-data, all unchanged
npm run test:static # Post-build smoke
```

CI order: `npm test` runs after generate-pages-data and before build-pages; `npm run test:static` runs after build-pages and before the auto-commit step.

## `/data` Route UI

Server component at `app/data/page.tsx`. Reads `public/data/manifest.json` at build time, parses it through `ManifestSchema`, and renders semantic HTML. No `"use client"` directive — the manifest is baked into the rendered output.

Layout:

- Topbar (existing markup with `aria-current="page"` on the active link).
- Page intro: eyebrow "Static dashboard", h1 "Data sources & freshness", one-sentence lede describing the commit-and-deploy model.
- Build-metadata strip: `generatedAt` formatted; `generatedBy.runUrl` as a link to the workflow run.
- Source list: one `SourceCard` per source.
- Methodology note: validation tier and preserve-on-failure semantics.

`SourceCard` content per source:

- Display name + status badge (`statusBadge.green` / `statusBadge.amber` / `statusBadge.red`).
- "Last successful fetch: ..." (formatted timestamp).
- "Last attempted: ..." (shown only when status is not `ok`).
- "Latest data row: ... · N rows".
- Source host (truncated) linking to full URL.
- Download list. For `spxWeekdays`, wrapped in `<details>` so the 18 variants collapse by default.
- Error message if status is not `ok`.

Reused CSS classes: `shell`, `topbar`, `panel`, `eyebrow`, `chartStat`, `statusBadge`, `sourceNote`, `sourceLine`. New classes in `app/globals.css`: `sourceCard`, `downloadLinks`, `buildMetadataStrip`. The active-nav rule (`nav a[aria-current="page"]`) is added once and applied across the four existing pages plus `/data`.

Date formatting: `formatDateTime`, `formatDay`, `formatMonth`, `formatYear` are lifted to a new `lib/format.ts` from their current per-page duplicates and reused by `/data`, dashboard, detailed-chart, buffett-dashboard, and spx-weekday-dashboard.

Accessibility:

- Status badges carry `aria-label={`Status: ${status}`}`.
- Source fields rendered as `<dl>` for screen-reader-friendly key/value semantics.
- Download links describe the filename and format.

Mobile (≤640px): source cards stack one per row by default. Build-metadata strip collapses to single column. Long source URLs truncate with ellipsis; the full URL stays available via the `title` attribute and `href`.

## Pre-Work

Before sub-project (1) starts, commit the in-flight Forward-PE feature:

- `lib/forward-pe.ts`
- `tests/forward-pe.test.ts`
- The ~290 lines of changes to `app/chart/detailed-chart.tsx`
- The `app/globals.css` additions for `.forwardPeLine`, `.spxPriceLine`, `.rightAxisLabel`
- The README.md bullet point
- The `next-env.d.ts` path drift fix (regenerated by Next 16 anyway)

This is a single commit, separate from sub-project (1) work. The feature ships immediately under the existing custom-SVG chart pattern. Sub-project (2) will migrate it to the new chart library alongside the other charts.

The sub-project (1) PR diff therefore stays clean — none of the Forward-PE files are touched by (1) other than the existing nav-link update across `app/chart/detailed-chart.tsx`.

## Sub-Project Boundaries (Out Of Scope)

Held for later sub-projects, deliberately not part of (1):

- L4 freshness gates (per-source max-lag thresholds with `.refine` predicates). Belongs to a future iteration on validation once we have a year of operational data to calibrate thresholds.
- Topbar status pill or home-page freshness KPI card. Belongs to sub-project (3) IA redesign when the topbar gets restructured.
- Chart-library replacement. Sub-project (2).
- IA redesign with study cards and KPI strip. Sub-project (3).
- URL state for chart filters, keyboard navigation, Ctrl/⌘-gated wheel zoom, data-table fallback, CSV downloads. Sub-project (4) interaction polish.
- SPX weekday statistical depth (CI, distribution, box plot). Sub-project (5).
- Global CSS split, design-token centralization, Playwright + Lighthouse CI. Sub-project (6) maintainability.

## Verification

Run before considering implementation complete:

```
npm test
npm run generate:pages-data
npm run build:pages
npm run test:static
```

Browser QA on the built output (`npx serve out`):

- `/market-atlas/` and the four existing pages render with the new nav.
- `/market-atlas/data/` renders source cards with current statuses.
- No browser-console requests to `/api/*` from any page.
- Nav link active state is correct on each page.
- Error states (force by removing a JSON file) link to `/data`, not `/api/*`.

CI verification by triggering `workflow_dispatch` once after merging:

- Workflow completes without the rename hack.
- A data commit appears on `main` with `[skip ci]` if any source's JSON changed.
- A subsequent `push` event does not trigger another build (because of `[skip ci]`).
- Manually break one source (e.g., mock a 503) and confirm:
  - `manifest.sources[x].status === "stale"`.
  - `public/data/<x>.json` not modified.
  - Build still deploys.
  - `/data` shows the amber status with the error message.

## Agent Task Breakdown

Reference; the implementation plan that follows this spec will sequence the work in detail.

- **Agent A — Schemas and validator scaffolding.** `lib/schemas/*`, `lib/format.ts`, schema round-trip tests.
- **Agent B — Generator refactor.** `lib/generate-static-data.ts`, `scripts/generate-pages-data.mjs`, `tests/generate-static-data.test.ts`. Replace SQLite-backed SPX path with direct fetch + parse + analytics.
- **Agent C — Demolition.** Delete `app/api/`, `lib/market-data/`, `lib/spx-weekday-service.ts`, the rename hack in `scripts/build-pages.mjs`, the cache wrappers in `lib/shiller.ts` and `lib/buffett.ts`, the deleted-tests pair, and the `.gitignore`/`data/` cleanup.
- **Agent D — `lib/pages-data.ts` + page wiring.** Collapse the helper; update each page's `loadXPageDataset` consumer; update nav and error-state links across the four existing pages and their dashboards; align `app/spx-weekdays/spx-weekday-dashboard.tsx` with the trimmed `SpxWeekdayPayload`.
- **Agent E — `/data` route.** New server component + CSS classes + active-nav rule.
- **Agent F — Smoke test.** `scripts/test-static-export.ts`, `package.json` script, README docs update.
- **Agent G — Workflow update.** `.github/workflows/deploy-pages.yml` with new permissions, generate step, unit-test step, smoke step, and auto-commit step.
- **Agent H — Verification.** Full local run-through, browser QA, scheduled-dispatch trial, simulated source failure test.
