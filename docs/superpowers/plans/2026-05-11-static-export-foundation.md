# Static-Export Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Market Atlas around a build-time-generated, git-committed static-JSON dataset. Eliminate the `app/api/` rename hack, the SQLite cache layer, the dev/prod data-loading split, and the broken `/api/*` links shown to users. Introduce a Zod L3 validation gate with preserve-on-failure semantics, a `/data` route surfacing per-source freshness via a new `public/data/manifest.json`, and a post-build smoke test.

**Architecture:** Build-time only. The deployed site is HTML/CSS/JS plus `public/data/*.json` and `public/data/manifest.json`. Live fetchers stay in `lib/` but are reachable only from `scripts/generate-pages-data.mjs` via a new testable orchestrator (`lib/generate-static-data.ts`). On scheduled CI runs, refreshed data is auto-committed back to `main` with `[skip ci]`. The new `/data` server-component route reads the manifest at build time and renders a status table. A new `scripts/test-static-export.ts` smoke test runs between build and deploy, verifying routes, data files, manifest schema, and absence of `/api/` substrings.

**Tech Stack:** Next.js 16 App Router (static export), React 19, TypeScript 6, Vitest 4.1, Zod, Node 24 (`node:fs/promises` glob), GitHub Actions.

---

## Source Spec

Implement the approved design in `docs/superpowers/specs/2026-05-11-static-export-foundation-design.md`. The spec defines the manifest schema, validation tier, error-handling matrix, CI workflow, file inventory, and `/data` route UI. This plan executes that spec — do not redesign during implementation.

## File Structure

### New files

- `lib/format.ts` — shared date formatters (`formatDateTime`, `formatDay`, `formatMonth`, `formatYear`) lifted from per-page duplicates.
- `lib/schemas/manifest.ts` — Zod `ManifestSchema` + TS types.
- `lib/schemas/shiller.ts` — Zod `ShillerDatasetSchema` with L3 sanity bounds.
- `lib/schemas/buffett.ts` — Zod `BuffettDatasetSchema`.
- `lib/schemas/spx-weekdays.ts` — Zod `SpxWeekdayPayloadSchema`.
- `lib/generate-static-data.ts` — testable orchestrator with dependency-injected fetchers + filesystem.
- `tests/format.test.ts` — round-trip tests for shared formatters.
- `tests/schemas.test.ts` — green + red fixtures for the four Zod schemas, plus committed-data validation.
- `tests/generate-static-data.test.ts` — orchestrator behavior with mock fetchers.
- `scripts/test-static-export.ts` — post-build smoke test, runs as `npm run test:static`.
- `app/data/page.tsx` — server component for the `/data` route.

### Modified files

- `scripts/generate-pages-data.mjs` — becomes a thin entry that calls `generateStaticData`.
- `scripts/build-pages.mjs` — delete the `app/api` rename hack; reduce to `spawn next build`.
- `package.json` — add `zod` dependency, add `test:static` script.
- `.github/workflows/deploy-pages.yml` — `contents: write` permission, new generate / unit-test / smoke / auto-commit steps, retain cron-comment block.
- `lib/pages-data.ts` — collapse to single `readStaticJson<T>(relativePath)`.
- `lib/shiller.ts` — delete 6h in-memory cache wrapper; `export` the three URL constants.
- `lib/buffett.ts` — delete cache wrapper.
- `app/page.tsx`, `app/chart/page.tsx`, `app/buffett/page.tsx`, `app/spx-weekdays/page.tsx` — nav `/#about` → `/data`; error-state `/api/*` → `/data/*.json`; drop `revalidate`.
- `app/dashboard.tsx`, `app/chart/detailed-chart.tsx`, `app/buffett/buffett-dashboard.tsx`, `app/valuation-chart.tsx` — nav updates (where applicable); import shared date formatters.
- `app/spx-weekdays/spx-weekday-dashboard.tsx` — fetch URL collapses to static-JSON path; `SourceNote` receives freshness as a prop; type changes from `SpxWeekdayPayload` removing `database` and `warning`; imports shared formatters.
- `app/globals.css` — new `sourceCard`, `downloadLinks`, `buildMetadataStrip` classes; active-nav rule.
- `next.config.mjs` — delete `NEXT_PUBLIC_STATIC_EXPORT` from the `env` block.
- `lib/paths.ts` — delete `isStaticExport`.
- `README.md` — replace `/api/*` references; document `/data` route + manifest.
- `.gitignore` — remove `public/data/` (required for the new model) and `data/*.sqlite*` lines.
- `next-env.d.ts` — reset path drift (regenerates on `next dev`).
- `tests/spx-weekday-layout.test.ts` — update fixture to drop `database` and `warning`.

### Deleted files / dirs

- `app/api/shiller/route.ts`, `app/api/buffett/route.ts`, `app/api/spx-weekdays/route.ts`, `app/api/` (empty dir).
- `lib/market-data/db.ts`, `lib/market-data/sources.ts`, `lib/market-data/spx-repository.ts`, `lib/market-data/` (empty dir).
- `lib/spx-weekday-service.ts`.
- `tests/market-data.test.ts`.
- `tests/spx-weekday-service.test.ts`.
- `data/` directory (and any local `.sqlite*` artifacts) if it exists after `.gitignore` cleanup.

---

## Pre-Work: Commit Forward-PE Feature

Before any sub-project (1) task runs, commit the in-flight Forward-PE feature. This is its own commit on `main`, separate from the sub-project (1) PR diff.

- [ ] **Step 1: Verify the worktree state**

Run:

```bash
git status --short
```

Expected:

```
 M README.md
 M app/chart/detailed-chart.tsx
 M app/globals.css
 M next-env.d.ts
?? lib/forward-pe.ts
?? tests/forward-pe.test.ts
```

(Plus any uncommitted spec/plan files from the brainstorming phase.)

- [ ] **Step 2: Run the test suite to confirm Forward-PE is green**

Run:

```bash
npm test -- tests/forward-pe.test.ts
```

Expected: 1 test passes.

- [ ] **Step 3: Stage and commit only the Forward-PE files**

Run:

```bash
git add lib/forward-pe.ts tests/forward-pe.test.ts \
        app/chart/detailed-chart.tsx app/globals.css \
        next-env.d.ts README.md
git commit -m "$(cat <<'EOF'
Add realized one-year-ahead Forward PE comparison chart

Adds a Shiller-based forward PE vs SPX price chart to the detailed
chart workbench. Forward PE = current SPX price / first available
Shiller earnings >= 12 months later (realized one-year-ahead
multiple, not consensus analyst estimate).

- lib/forward-pe.ts: pure function building comparison points
- tests/forward-pe.test.ts: round-trip coverage
- app/chart/detailed-chart.tsx: new chart panel below the CAPE chart
- app/globals.css: gold/blue line styles for the new chart
- README.md: bullet point describing the new comparison
- next-env.d.ts: routes.d.ts path drift (regenerates on next dev)
EOF
)"
```

- [ ] **Step 4: Verify the Forward-PE commit landed cleanly**

Run:

```bash
git log --oneline -3
git status --short
```

Expected: top commit is the Forward-PE one; working tree may still show the spec/plan files but not the Forward-PE ones.

---

## Chunk 1: Bootstrap and schemas (Tasks 1–3)

### Task 1: Bootstrap commit — track public/data/ and remove SQLite gitignore lines

**Files:**
- Modify: `.gitignore`
- Stage: `public/data/shiller.json`, `public/data/buffett.json`, `public/data/spx-weekdays/*.json` (~20 files)

This is **Commit A** from the spec's Bootstrap section. Required before any other sub-project (1) work because the new pipeline depends on `public/data/` being git-tracked.

- [ ] **Step 1: Confirm the gitignore state**

Run:

```bash
grep -n '^public/data\|^data/' .gitignore
```

Expected:

```
5:public/data/
11:data/*.sqlite
12:data/*.sqlite-*
```

- [ ] **Step 2: Confirm the on-disk files exist but are untracked**

Run:

```bash
ls -1 public/data/ public/data/spx-weekdays/ | head -25
git ls-files public/data/ | wc -l
```

Expected: 20+ files on disk; `git ls-files` returns 0.

- [ ] **Step 3: Edit `.gitignore` to remove the three lines**

Remove lines 5, 11, 12 (`public/data/`, `data/*.sqlite`, `data/*.sqlite-*`).

After edit, `.gitignore` should be:

```
node_modules/
.worktrees/
.next/
out/
.env*.local
tsconfig.tsbuildinfo
.superpowers/
.DS_Store
.idea/
```

- [ ] **Step 4: Stage the existing JSON files**

Run:

```bash
git add .gitignore public/data/
git status --short | head -25
```

Expected: `M .gitignore` plus 20 `A` (added) entries under `public/data/`.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Track public/data/*.json as committed fallback

The static-export foundation rewrite requires public/data/ to be
git-tracked: CI runs generate fresh JSON, write it here, and push
back to main. The previous .gitignore line prevented tracking.

Also drops the data/*.sqlite ignore lines; the SQLite cache layer
goes away later in this PR.

Bootstrap Commit A per
docs/superpowers/specs/2026-05-11-static-export-foundation-design.md
EOF
)"
```

- [ ] **Step 6: Verify**

```bash
git ls-files public/data/ | wc -l
```

Expected: 20 (1 shiller.json + 1 buffett.json + 18 spx-weekdays variants).

---

### Task 2: Shared date-formatter module

**Files:**
- Create: `lib/format.ts`
- Create: `tests/format.test.ts`
- Modify: `app/dashboard.tsx`, `app/chart/detailed-chart.tsx`, `app/buffett/buffett-dashboard.tsx`, `app/valuation-chart.tsx`, `app/spx-weekdays/spx-weekday-dashboard.tsx`

Lifts the duplicated formatters out of five files so the new `/data` route and the existing consumers share one source.

- [ ] **Step 1: Write the failing test**

Create `tests/format.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import {
  formatDateTime,
  formatDay,
  formatMonth,
  formatYear
} from "../lib/format";

describe("formatMonth", () => {
  test("formats YYYY-MM-DD as 'Mon YYYY' in UTC", () => {
    expect(formatMonth("2025-05-01")).toBe("May 2025");
    expect(formatMonth("2000-12-15")).toBe("Dec 2000");
  });
});

describe("formatDay", () => {
  test("formats YYYY-MM-DD as 'Mon D, YYYY' in UTC", () => {
    expect(formatDay("2026-05-08")).toBe("May 8, 2026");
    expect(formatDay("1999-01-31")).toBe("Jan 31, 1999");
  });
});

describe("formatYear", () => {
  test("formats YYYY-MM-DD as 'YYYY'", () => {
    expect(formatYear("2024-07-04")).toBe("2024");
  });
});

describe("formatDateTime", () => {
  test("formats an ISO timestamp with month, day, year, time, tz", () => {
    const out = formatDateTime("2026-05-11T00:32:14.123Z");
    expect(out).toMatch(/May/);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/\d/);
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/format.test.ts
```

Expected: 4 failures with "Failed to load url ../lib/format".

- [ ] **Step 3: Create `lib/format.ts`**

```typescript
export function formatMonth(date: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function formatYear(date: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function formatDateTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(isoTimestamp));
}
```

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- tests/format.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Replace per-page duplicates with imports**

In each of these five files, delete the local `formatMonth` / `formatDay` / `formatYear` / `formatDateTime` function definitions and add the corresponding import at the top:

```typescript
import { formatDateTime, formatDay, formatMonth, formatYear } from "../lib/format";
// (adjust relative path: ../../lib/format from nested routes)
```

Files and current local helper names to delete:

| File | Functions to delete |
|---|---|
| `app/dashboard.tsx` | `formatMonth`, `formatDay`, `formatDateTime` (lines ~301–327) |
| `app/chart/detailed-chart.tsx` | `formatMonth`, `formatDay`, `formatYear`, `formatDateTime` (search for the function declarations) |
| `app/buffett/buffett-dashboard.tsx` | `formatYear`, `formatDateTime` (lines ~529–549) — `formatQuarter` and `formatPointLabel` STAY (single-use) |
| `app/valuation-chart.tsx` | `formatMonth`, `formatDay` (lines ~417–432) |
| `app/spx-weekdays/spx-weekday-dashboard.tsx` | `formatDay`, `formatDateTime` (lines ~762–768) — keep `formatTickDate`, `formatPercent`, etc. (single-use). **Also delete** the now-unused `dateFormatter` and `dateTimeFormatter` module-level `Intl.DateTimeFormat` constants (lines ~79 and ~85) that the deleted helpers wrapped. |

Use Edit tool per file, deleting old function definitions and adding the import.

- [ ] **Step 6: Run all tests + typecheck-equivalent build**

```bash
npm test
npm run build
```

Expected: all tests pass; build completes without TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add lib/format.ts tests/format.test.ts \
        app/dashboard.tsx app/chart/detailed-chart.tsx \
        app/buffett/buffett-dashboard.tsx app/valuation-chart.tsx \
        app/spx-weekdays/spx-weekday-dashboard.tsx
git commit -m "Lift shared date formatters to lib/format.ts"
```

---

### Task 3: Zod schemas (manifest, shiller, buffett, spx-weekdays)

**Files:**
- Create: `lib/schemas/manifest.ts`, `lib/schemas/shiller.ts`, `lib/schemas/buffett.ts`, `lib/schemas/spx-weekdays.ts`
- Create: `tests/schemas.test.ts`
- Modify: `lib/shiller.ts` (export URL constants), `package.json` (add `zod` dep)

L3 validation: Zod schemas with sanity bounds. The shiller URLs become exports because the generator orchestrator (Task 4) needs them.

- [ ] **Step 1: Install Zod**

Run:

```bash
npm install zod@latest
```

Expected: `zod` appears in `dependencies` block of `package.json`; `package-lock.json` updated.

Verify:

```bash
grep -A1 '"dependencies"' package.json | head -10
```

Expected: includes `"zod": "..."`.

- [ ] **Step 2: Export URL constants in `lib/shiller.ts`**

In `lib/shiller.ts`, find these lines (currently file-internal `const`):

```typescript
const SHILLER_SOURCE_URLS = [
  "https://img1.wsimg.com/...",
  "http://www.econ.yale.edu/..."
] as const;

const FRED_SP500_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500";
const NASDAQ_SPY_SOURCE_URL = "https://api.nasdaq.com/api/quote/SPY/historical?assetclass=etf";
```

Add `export` to each:

```typescript
export const SHILLER_SOURCE_URLS = [...] as const;
export const FRED_SP500_URL = "...";
export const NASDAQ_SPY_SOURCE_URL = "...";
```

- [ ] **Step 3: Write the failing test file**

Create `tests/schemas.test.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ManifestSchema } from "../lib/schemas/manifest";
import { ShillerDatasetSchema } from "../lib/schemas/shiller";
import { BuffettDatasetSchema } from "../lib/schemas/buffett";
import { SpxWeekdayPayloadSchema } from "../lib/schemas/spx-weekdays";

const validShillerPoint = {
  date: "2025-05-01",
  cape: 38.2,
  price: 5800,
  earnings: 215,
  longRate: 4.2,
  frequency: "monthly" as const
};

function generateShillerPoints(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const monthIndex = index % 12;
    const year = 1880 + Math.floor(index / 12);
    return {
      ...validShillerPoint,
      date: `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`,
      cape: 15 + (index % 25)
    };
  });
}

const validShillerDataset = {
  points: generateShillerPoints(1600),
  sourceUrl: "https://example.com/ie_data.xls",
  dailySourceUrl: null,
  ohlcSourceUrl: null,
  fetchedAt: "2026-05-11T00:32:14.123Z"
};

describe("ShillerDatasetSchema", () => {
  test("accepts a valid dataset", () => {
    expect(() => ShillerDatasetSchema.parse(validShillerDataset)).not.toThrow();
  });

  test("rejects negative cape", () => {
    const bad = {
      ...validShillerDataset,
      points: [{ ...validShillerDataset.points[0], cape: -1 }, ...validShillerDataset.points.slice(1)]
    };
    expect(() => ShillerDatasetSchema.parse(bad)).toThrow();
  });

  test("rejects cape >= 200", () => {
    const bad = {
      ...validShillerDataset,
      points: [{ ...validShillerDataset.points[0], cape: 250 }, ...validShillerDataset.points.slice(1)]
    };
    expect(() => ShillerDatasetSchema.parse(bad)).toThrow();
  });

  test("rejects bad date format", () => {
    const bad = {
      ...validShillerDataset,
      points: [{ ...validShillerDataset.points[0], date: "5/8/2026" }, ...validShillerDataset.points.slice(1)]
    };
    expect(() => ShillerDatasetSchema.parse(bad)).toThrow();
  });

  test("rejects non-monotonic dates", () => {
    const bad = {
      ...validShillerDataset,
      points: [
        { ...validShillerDataset.points[1], date: "1900-01-01" },
        { ...validShillerDataset.points[0], date: "1880-01-01" },
        ...validShillerDataset.points.slice(2)
      ]
    };
    expect(() => ShillerDatasetSchema.parse(bad)).toThrow();
  });

  test("rejects below-minimum row count", () => {
    const bad = { ...validShillerDataset, points: validShillerDataset.points.slice(0, 100) };
    expect(() => ShillerDatasetSchema.parse(bad)).toThrow();
  });

  test("rejects NaN and Infinity", () => {
    const withNaN = {
      ...validShillerDataset,
      points: [{ ...validShillerDataset.points[0], cape: NaN }, ...validShillerDataset.points.slice(1)]
    };
    const withInf = {
      ...validShillerDataset,
      points: [{ ...validShillerDataset.points[0], cape: Infinity }, ...validShillerDataset.points.slice(1)]
    };
    expect(() => ShillerDatasetSchema.parse(withNaN)).toThrow();
    expect(() => ShillerDatasetSchema.parse(withInf)).toThrow();
  });
});

const validBuffettPoint = {
  date: "2025-12-31",
  marketValue: 55000,
  gdp: 28000,
  gdpDate: "2025-12-31",
  ratio: 196.4
};

const validBuffettDataset = {
  points: Array.from({ length: 300 }, (_, index) => {
    const year = 1945 + Math.floor(index / 4);
    const month = ((index % 4) * 3) + 1;
    return {
      ...validBuffettPoint,
      date: `${year}-${String(month).padStart(2, "0")}-01`,
      ratio: 80 + (index % 80)
    };
  }),
  worldPoints: [],
  globalPoints: [],
  marketValueSourceUrl: "https://fred.stlouisfed.org/...",
  gdpSourceUrl: "https://fred.stlouisfed.org/...",
  worldGdpSourceUrl: "https://fred.stlouisfed.org/...",
  worldMarketValueSourceUrl: "https://api.worldbank.org/...",
  fetchedAt: "2026-05-11T00:32:14.123Z"
};

describe("BuffettDatasetSchema", () => {
  test("accepts a valid dataset", () => {
    expect(() => BuffettDatasetSchema.parse(validBuffettDataset)).not.toThrow();
  });

  test("rejects ratio <= 0", () => {
    const bad = {
      ...validBuffettDataset,
      points: [{ ...validBuffettDataset.points[0], ratio: 0 }, ...validBuffettDataset.points.slice(1)]
    };
    expect(() => BuffettDatasetSchema.parse(bad)).toThrow();
  });

  test("rejects below-minimum row count", () => {
    const bad = { ...validBuffettDataset, points: validBuffettDataset.points.slice(0, 50) };
    expect(() => BuffettDatasetSchema.parse(bad)).toThrow();
  });
});

const validSpxWeekdayPayload = {
  range: "1y" as const,
  method: "openClose" as const,
  startDate: "2025-05-12",
  endDate: "2026-05-08",
  summaryPoints: Array.from({ length: 5 }, (_, index) => ({
    weekday: (["Monday","Tuesday","Wednesday","Thursday","Friday"] as const)[index],
    averageReturn: 0.05,
    totalReturn: 12.4,
    winRate: 53,
    sampleCount: 50,
    bestReturn: 2.3,
    bestDate: "2025-12-15",
    worstReturn: -2.1,
    worstDate: "2025-10-30"
  })),
  weekdayStats: Array.from({ length: 5 }, (_, index) => ({
    weekday: (["Monday","Tuesday","Wednesday","Thursday","Friday"] as const)[index],
    averageReturn: 0.05,
    totalReturn: 12.4,
    winRate: 53,
    sampleCount: 50,
    bestReturn: 2.3,
    bestDate: "2025-12-15",
    worstReturn: -2.1,
    worstDate: "2025-10-30"
  })),
  cumulativeSeries: (["Monday","Tuesday","Wednesday","Thursday","Friday"] as const).map((weekday) => ({
    weekday,
    points: [
      { date: "2025-05-12", weekday, returnPct: 0.1, cumulativeReturn: 0.1 }
    ]
  })),
  source: {
    key: "yahoo-spx-chart",
    name: "Yahoo Finance SPX chart",
    displayName: "Yahoo Finance SPX chart",
    provider: "Yahoo Finance",
    url: "https://query1.finance.yahoo.com/..."
  }
};

describe("SpxWeekdayPayloadSchema", () => {
  test("accepts a valid payload", () => {
    expect(() => SpxWeekdayPayloadSchema.parse(validSpxWeekdayPayload)).not.toThrow();
  });

  test("rejects weekdayStats with wrong length", () => {
    const bad = {
      ...validSpxWeekdayPayload,
      weekdayStats: validSpxWeekdayPayload.weekdayStats.slice(0, 3)
    };
    expect(() => SpxWeekdayPayloadSchema.parse(bad)).toThrow();
  });

  test("rejects cumulativeSeries with wrong length", () => {
    const bad = {
      ...validSpxWeekdayPayload,
      cumulativeSeries: validSpxWeekdayPayload.cumulativeSeries.slice(0, 4)
    };
    expect(() => SpxWeekdayPayloadSchema.parse(bad)).toThrow();
  });
});

const validManifest = {
  schemaVersion: 1,
  generatedAt: "2026-05-11T00:32:14.123Z",
  generatedBy: { ref: "refs/heads/main", sha: null, runId: null, runUrl: null },
  validationTier: "L3" as const,
  sources: {
    shiller: {
      displayName: "Shiller CAPE workbook",
      status: "ok" as const,
      latestDate: "2026-05-01",
      rowCount: 1844,
      sourceUrls: ["https://example.com/ie_data.xls"],
      lastSuccessfulFetchAt: "2026-05-11T00:32:14.123Z",
      lastAttemptedFetchAt: "2026-05-11T00:32:14.123Z",
      errorMessage: null
    },
    buffett: {
      displayName: "FRED Buffett indicator + World Bank",
      status: "ok" as const,
      latestDate: "2025-12-31",
      rowCount: 314,
      sourceUrls: ["https://example.com/x", "https://example.com/y"],
      lastSuccessfulFetchAt: "2026-05-11T00:32:14.123Z",
      lastAttemptedFetchAt: "2026-05-11T00:32:14.123Z",
      errorMessage: null
    },
    spxWeekdays: {
      displayName: "Yahoo Finance SPX chart",
      status: "ok" as const,
      latestDate: "2026-05-08",
      rowCount: 8312,
      sourceUrls: ["https://example.com/yahoo"],
      lastSuccessfulFetchAt: "2026-05-11T00:32:14.123Z",
      lastAttemptedFetchAt: "2026-05-11T00:32:14.123Z",
      errorMessage: null
    }
  }
};

describe("ManifestSchema", () => {
  test("accepts a valid manifest", () => {
    expect(() => ManifestSchema.parse(validManifest)).not.toThrow();
  });

  test("rejects unknown status enum value", () => {
    const bad = {
      ...validManifest,
      sources: {
        ...validManifest.sources,
        shiller: { ...validManifest.sources.shiller, status: "bogus" }
      }
    };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  test("rejects empty sourceUrls", () => {
    const bad = {
      ...validManifest,
      sources: {
        ...validManifest.sources,
        shiller: { ...validManifest.sources.shiller, sourceUrls: [] }
      }
    };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  test("rejects wrong schemaVersion", () => {
    const bad = { ...validManifest, schemaVersion: 2 };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });
});

describe("committed public/data passes its schemas", () => {
  const dataDir = join(process.cwd(), "public", "data");

  test("shiller.json parses against ShillerDatasetSchema if present", () => {
    const path = join(dataDir, "shiller.json");
    if (!existsSync(path)) return;
    const data = JSON.parse(readFileSync(path, "utf8"));
    expect(() => ShillerDatasetSchema.parse(data)).not.toThrow();
  });

  test("buffett.json parses against BuffettDatasetSchema if present", () => {
    const path = join(dataDir, "buffett.json");
    if (!existsSync(path)) return;
    const data = JSON.parse(readFileSync(path, "utf8"));
    expect(() => BuffettDatasetSchema.parse(data)).not.toThrow();
  });

  test.each([
    "1m-openClose","1m-closeClose","3m-openClose","3m-closeClose",
    "6m-openClose","6m-closeClose","ytd-openClose","ytd-closeClose",
    "1y-openClose","1y-closeClose","2y-openClose","2y-closeClose",
    "5y-openClose","5y-closeClose","10y-openClose","10y-closeClose",
    "all-openClose","all-closeClose"
  ])("spx-weekdays/%s.json parses if present", (variant) => {
    const path = join(dataDir, "spx-weekdays", `${variant}.json`);
    if (!existsSync(path)) return;
    const data = JSON.parse(readFileSync(path, "utf8"));
    expect(() => SpxWeekdayPayloadSchema.parse(data)).not.toThrow();
  });
});
```

- [ ] **Step 4: Verify RED**

```bash
npm test -- tests/schemas.test.ts
```

Expected: all tests fail with "Failed to load url ../lib/schemas/...".

- [ ] **Step 5: Implement `lib/schemas/shiller.ts`**

```typescript
import { z } from "zod";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const FiniteNumber = z.number().finite();
const PositiveNumber = z.number().finite().positive();

const OhlcSchema = z.object({
  open: FiniteNumber,
  high: FiniteNumber,
  low: FiniteNumber,
  close: FiniteNumber
});

const ShillerPointSchema = z.object({
  date: DateString,
  cape: z.number().finite().gt(0).lt(200),
  price: PositiveNumber.nullable(),
  priceOhlc: OhlcSchema.nullable().optional(),
  earnings: PositiveNumber.nullable(),
  longRate: FiniteNumber.nullable(),
  cpi: FiniteNumber.nullable().optional(),
  realPrice: FiniteNumber.nullable().optional(),
  realEarnings: FiniteNumber.nullable().optional(),
  avgRealEarnings: FiniteNumber.nullable().optional(),
  capeOhlc: OhlcSchema.nullable().optional(),
  sourceCape: FiniteNumber.nullable().optional(),
  frequency: z.enum(["monthly", "daily"]).optional(),
  source: z.string().optional()
});

export const ShillerDatasetSchema = z.object({
  points: z
    .array(ShillerPointSchema)
    .min(1500, "Expected at least 1500 Shiller points")
    .refine(
      (points) => points.every((p, i) => i === 0 || points[i - 1].date <= p.date),
      "Dates must be monotonically non-decreasing"
    ),
  sourceUrl: z.string().url(),
  dailySourceUrl: z.string().url().nullable(),
  ohlcSourceUrl: z.string().url().nullable(),
  fetchedAt: z.string()
});

export type ShillerDataset = z.infer<typeof ShillerDatasetSchema>;
```

- [ ] **Step 6: Implement `lib/schemas/buffett.ts`**

```typescript
import { z } from "zod";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const PositiveFiniteNumber = z.number().finite().positive();

const BuffettPointSchema = z.object({
  date: DateString,
  marketValue: PositiveFiniteNumber,
  gdp: PositiveFiniteNumber,
  gdpDate: DateString,
  ratio: PositiveFiniteNumber
});

export const BuffettDatasetSchema = z.object({
  points: z
    .array(BuffettPointSchema)
    .min(200, "Expected at least 200 Buffett points")
    .refine(
      (points) => points.every((p, i) => i === 0 || points[i - 1].date <= p.date),
      "Dates must be monotonically non-decreasing"
    ),
  worldPoints: z.array(BuffettPointSchema),
  globalPoints: z.array(BuffettPointSchema),
  marketValueSourceUrl: z.string().url(),
  gdpSourceUrl: z.string().url(),
  worldGdpSourceUrl: z.string().url(),
  worldMarketValueSourceUrl: z.string().url(),
  fetchedAt: z.string()
});

export type BuffettDataset = z.infer<typeof BuffettDatasetSchema>;
```

- [ ] **Step 7: Implement `lib/schemas/spx-weekdays.ts`**

```typescript
import { z } from "zod";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const FiniteNumber = z.number().finite();

const WeekdayEnum = z.enum(["Monday","Tuesday","Wednesday","Thursday","Friday"]);
const RangeEnum = z.enum(["1m","3m","6m","ytd","1y","2y","5y","10y","all"]);
const MethodEnum = z.enum(["openClose","closeClose"]);

const StatSchema = z.object({
  weekday: WeekdayEnum,
  averageReturn: FiniteNumber,
  totalReturn: FiniteNumber,
  winRate: FiniteNumber,
  sampleCount: z.number().int().nonnegative(),
  bestReturn: FiniteNumber.nullable(),
  bestDate: DateString.nullable(),
  worstReturn: FiniteNumber.nullable(),
  worstDate: DateString.nullable()
});

const ReturnPointSchema = z.object({
  date: DateString,
  weekday: WeekdayEnum,
  returnPct: FiniteNumber,
  cumulativeReturn: FiniteNumber
});

const CumulativeSeriesSchema = z.object({
  weekday: WeekdayEnum,
  points: z.array(ReturnPointSchema)
});

const SourceMetaSchema = z.object({
  key: z.string(),
  name: z.string(),
  displayName: z.string(),
  provider: z.string(),
  url: z.string().url()
});

export const SpxWeekdayPayloadSchema = z.object({
  range: RangeEnum,
  method: MethodEnum,
  startDate: DateString.nullable(),
  endDate: DateString.nullable(),
  summaryPoints: z.array(StatSchema).length(5),
  weekdayStats: z.array(StatSchema).length(5),
  cumulativeSeries: z.array(CumulativeSeriesSchema).length(5),
  source: SourceMetaSchema
});

export type SpxWeekdayPayload = z.infer<typeof SpxWeekdayPayloadSchema>;
```

Note: this schema is the *committed JSON* shape, without `database` and `warning` (those fields go away in Task 6).

- [ ] **Step 8: Implement `lib/schemas/manifest.ts`**

```typescript
import { z } from "zod";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const IsoTimestamp = z.string();

const SourceStatusSchema = z.object({
  displayName: z.string().min(1),
  status: z.enum(["ok", "stale", "failed"]),
  latestDate: DateString.nullable(),
  rowCount: z.number().int().nonnegative(),
  sourceUrls: z.array(z.string().url()).min(1),
  lastSuccessfulFetchAt: IsoTimestamp.nullable(),
  lastAttemptedFetchAt: IsoTimestamp,
  errorMessage: z.string().nullable()
});

const GeneratedBySchema = z.object({
  ref: z.string().min(1),
  sha: z.string().nullable(),
  runId: z.string().nullable(),
  runUrl: z.string().url().nullable()
});

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: IsoTimestamp,
  generatedBy: GeneratedBySchema,
  validationTier: z.literal("L3"),
  sources: z.object({
    shiller: SourceStatusSchema,
    buffett: SourceStatusSchema,
    spxWeekdays: SourceStatusSchema
  })
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
```

- [ ] **Step 9: Verify GREEN**

```bash
npm test -- tests/schemas.test.ts
```

Expected: all schema tests pass. The `committed public/data passes its schemas` describe should also pass — the currently-checked-in JSON files conform to the schemas. If not, fix the schema (don't relax silently — investigate). Most likely culprit: optional fields you forgot.

- [ ] **Step 10: Verify full test suite + build**

```bash
npm test
npm run build
```

Expected: all tests pass, build completes.

- [ ] **Step 11: Commit**

```bash
git add lib/schemas/ tests/schemas.test.ts \
        lib/shiller.ts package.json package-lock.json
git commit -m "Add Zod L3 schemas for manifest and per-source datasets"
```

---

## Chunk 2: Generator orchestrator and first manifest (Tasks 4–5)

### Task 4: Generator orchestrator

**Files:**
- Create: `lib/generate-static-data.ts`
- Create: `tests/generate-static-data.test.ts`
- Modify: `scripts/generate-pages-data.mjs`

The orchestrator with dependency-injected fetchers + filesystem. Tests cover the full failure matrix from the spec's Error Handling section.

- [ ] **Step 1: Write the failing test file**

Create `tests/generate-static-data.test.ts`:

```typescript
import { describe, expect, test, beforeEach } from "vitest";
import { generateStaticData, type Fetchers, type FileSystem } from "../lib/generate-static-data";
import type { Manifest } from "../lib/schemas/manifest";

const FIXED_NOW = new Date("2026-05-11T00:32:14.123Z");

function buildValidShillerData() {
  return {
    points: Array.from({ length: 1600 }, (_, i) => ({
      date: `${1880 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
      cape: 15 + (i % 25),
      price: 100 + i,
      earnings: 5 + i / 100,
      longRate: 4,
      frequency: "monthly" as const
    })),
    sourceUrl: "https://example.com/ie_data.xls",
    dailySourceUrl: null,
    ohlcSourceUrl: null,
    fetchedAt: FIXED_NOW.toISOString()
  };
}

function buildValidBuffettData() {
  return {
    points: Array.from({ length: 300 }, (_, i) => {
      const year = 1945 + Math.floor(i / 4);
      const month = ((i % 4) * 3) + 1;
      return {
        date: `${year}-${String(month).padStart(2, "0")}-01`,
        marketValue: 5000 + i * 10,
        gdp: 2500 + i * 5,
        gdpDate: `${year}-${String(month).padStart(2, "0")}-01`,
        ratio: 80 + (i % 80)
      };
    }),
    worldPoints: [],
    globalPoints: [],
    marketValueSourceUrl: "https://fred.stlouisfed.org/...",
    gdpSourceUrl: "https://fred.stlouisfed.org/...",
    worldGdpSourceUrl: "https://fred.stlouisfed.org/...",
    worldMarketValueSourceUrl: "https://api.worldbank.org/...",
    fetchedAt: FIXED_NOW.toISOString()
  };
}

function buildValidSpxRawPayload() {
  // Minimal shape that parseYahooSpxChartJson can parse into >= 5000 rows.
  const timestamps: number[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];

  const start = Date.UTC(1993, 0, 4) / 1000; // Mon Jan 4 1993
  for (let i = 0; i < 5500; i++) {
    timestamps.push(start + i * 86400);
    opens.push(100 + i * 0.01);
    highs.push(101 + i * 0.01);
    lows.push(99 + i * 0.01);
    closes.push(100 + i * 0.01);
    volumes.push(1000);
  }

  return {
    chart: {
      result: [
        {
          timestamp: timestamps,
          indicators: { quote: [{ open: opens, high: highs, low: lows, close: closes, volume: volumes }] }
        }
      ]
    }
  };
}

function makeFs(): FileSystem & { writes: Map<string, string>; reads: Map<string, string> } {
  const writes = new Map<string, string>();
  const reads = new Map<string, string>();
  return {
    writes,
    reads,
    readFile: async (path) => reads.get(path) ?? null,
    writeFile: async (path, content) => { writes.set(path, content); }
  };
}

const DATA_DIR = "/fake/public/data";

describe("generateStaticData", () => {
  test("all sources succeed → all status ok, JSONs written, manifest written", async () => {
    const fs = makeFs();
    const fetchers: Fetchers = {
      shiller: async () => buildValidShillerData(),
      buffett: async () => buildValidBuffettData(),
      spxRawPayload: async () => buildValidSpxRawPayload()
    };
    const manifest = await generateStaticData({
      fetchers, fs, env: {}, dataDir: DATA_DIR, now: () => FIXED_NOW
    });

    expect(manifest.sources.shiller.status).toBe("ok");
    expect(manifest.sources.buffett.status).toBe("ok");
    expect(manifest.sources.spxWeekdays.status).toBe("ok");
    expect(fs.writes.has(`${DATA_DIR}/shiller.json`)).toBe(true);
    expect(fs.writes.has(`${DATA_DIR}/buffett.json`)).toBe(true);
    expect(fs.writes.has(`${DATA_DIR}/spx-weekdays/1y-openClose.json`)).toBe(true);
    expect(fs.writes.has(`${DATA_DIR}/manifest.json`)).toBe(true);
  });

  test("one fetcher rejects → that source stale, others ok, file untouched", async () => {
    const fs = makeFs();
    const priorShiller = buildValidShillerData();
    fs.reads.set(`${DATA_DIR}/shiller.json`, JSON.stringify(priorShiller));

    const fetchers: Fetchers = {
      shiller: async () => { throw new Error("FRED returned 503"); },
      buffett: async () => buildValidBuffettData(),
      spxRawPayload: async () => buildValidSpxRawPayload()
    };

    const manifest = await generateStaticData({
      fetchers, fs, env: {}, dataDir: DATA_DIR, now: () => FIXED_NOW
    });

    expect(manifest.sources.shiller.status).toBe("stale");
    expect(manifest.sources.shiller.errorMessage).toContain("FRED returned 503");
    expect(manifest.sources.buffett.status).toBe("ok");
    expect(fs.writes.has(`${DATA_DIR}/shiller.json`)).toBe(false);
  });

  test("fetch ok but Zod validation fails → stale, file untouched, errorMessage populated", async () => {
    const fs = makeFs();
    const priorShiller = buildValidShillerData();
    fs.reads.set(`${DATA_DIR}/shiller.json`, JSON.stringify(priorShiller));

    const fetchers: Fetchers = {
      shiller: async () => {
        const bad = buildValidShillerData();
        bad.points[0].cape = -1; // L3 violation
        return bad;
      },
      buffett: async () => buildValidBuffettData(),
      spxRawPayload: async () => buildValidSpxRawPayload()
    };

    const manifest = await generateStaticData({
      fetchers, fs, env: {}, dataDir: DATA_DIR, now: () => FIXED_NOW
    });

    expect(manifest.sources.shiller.status).toBe("stale");
    expect(manifest.sources.shiller.errorMessage).toMatch(/cape|too_small|positive/i);
    expect(fs.writes.has(`${DATA_DIR}/shiller.json`)).toBe(false);
  });

  test("source fails with no prior committed JSON → failed status", async () => {
    const fs = makeFs(); // no prior reads seeded
    const fetchers: Fetchers = {
      shiller: async () => { throw new Error("network down"); },
      buffett: async () => buildValidBuffettData(),
      spxRawPayload: async () => buildValidSpxRawPayload()
    };

    const manifest = await generateStaticData({
      fetchers, fs, env: {}, dataDir: DATA_DIR, now: () => FIXED_NOW
    });

    expect(manifest.sources.shiller.status).toBe("failed");
  });

  test("all sources fail with no prior JSON → throws", async () => {
    const fs = makeFs();
    const fetchers: Fetchers = {
      shiller: async () => { throw new Error("a"); },
      buffett: async () => { throw new Error("b"); },
      spxRawPayload: async () => { throw new Error("c"); }
    };

    await expect(
      generateStaticData({ fetchers, fs, env: {}, dataDir: DATA_DIR, now: () => FIXED_NOW })
    ).rejects.toThrow();
  });

  test("lastSuccessfulFetchAt preserved when falling back to stale", async () => {
    const fs = makeFs();
    const priorShiller = buildValidShillerData();
    fs.reads.set(`${DATA_DIR}/shiller.json`, JSON.stringify(priorShiller));
    const priorManifest: Manifest = {
      schemaVersion: 1,
      generatedAt: "2026-05-10T00:00:00.000Z",
      generatedBy: { ref: "refs/heads/main", sha: null, runId: null, runUrl: null },
      validationTier: "L3",
      sources: {
        shiller: {
          displayName: "Shiller CAPE workbook",
          status: "ok",
          latestDate: "2026-05-01",
          rowCount: 1600,
          sourceUrls: ["https://example.com"],
          lastSuccessfulFetchAt: "2026-05-10T00:00:00.000Z",
          lastAttemptedFetchAt: "2026-05-10T00:00:00.000Z",
          errorMessage: null
        },
        buffett: { displayName: "x", status: "ok", latestDate: null, rowCount: 0, sourceUrls: ["https://x.example"], lastSuccessfulFetchAt: null, lastAttemptedFetchAt: "2026-05-10T00:00:00.000Z", errorMessage: null },
        spxWeekdays: { displayName: "x", status: "ok", latestDate: null, rowCount: 0, sourceUrls: ["https://x.example"], lastSuccessfulFetchAt: null, lastAttemptedFetchAt: "2026-05-10T00:00:00.000Z", errorMessage: null }
      }
    };
    fs.reads.set(`${DATA_DIR}/manifest.json`, JSON.stringify(priorManifest));

    const fetchers: Fetchers = {
      shiller: async () => { throw new Error("flaky"); },
      buffett: async () => buildValidBuffettData(),
      spxRawPayload: async () => buildValidSpxRawPayload()
    };

    const manifest = await generateStaticData({
      fetchers, fs, env: {}, dataDir: DATA_DIR, now: () => FIXED_NOW
    });

    expect(manifest.sources.shiller.status).toBe("stale");
    expect(manifest.sources.shiller.lastSuccessfulFetchAt).toBe("2026-05-10T00:00:00.000Z");
    expect(manifest.sources.shiller.lastAttemptedFetchAt).toBe(FIXED_NOW.toISOString());
  });

  test("SPX raw payload < 5000 rows → spxWeekdays stale, all 18 variants preserved", async () => {
    const fs = makeFs();
    // Seed prior committed variants
    for (const range of ["1m","3m","6m","ytd","1y","2y","5y","10y","all"]) {
      for (const method of ["openClose","closeClose"]) {
        fs.reads.set(`${DATA_DIR}/spx-weekdays/${range}-${method}.json`, '{"placeholder":"prior"}');
      }
    }

    // Build a shrunk raw payload with only 100 rows
    const tooSmall = buildValidSpxRawPayload();
    tooSmall.chart.result[0].timestamp = tooSmall.chart.result[0].timestamp.slice(0, 100);
    tooSmall.chart.result[0].indicators.quote[0].open = tooSmall.chart.result[0].indicators.quote[0].open.slice(0, 100);
    tooSmall.chart.result[0].indicators.quote[0].high = tooSmall.chart.result[0].indicators.quote[0].high.slice(0, 100);
    tooSmall.chart.result[0].indicators.quote[0].low = tooSmall.chart.result[0].indicators.quote[0].low.slice(0, 100);
    tooSmall.chart.result[0].indicators.quote[0].close = tooSmall.chart.result[0].indicators.quote[0].close.slice(0, 100);
    tooSmall.chart.result[0].indicators.quote[0].volume = tooSmall.chart.result[0].indicators.quote[0].volume.slice(0, 100);

    const fetchers: Fetchers = {
      shiller: async () => buildValidShillerData(),
      buffett: async () => buildValidBuffettData(),
      spxRawPayload: async () => tooSmall
    };

    const manifest = await generateStaticData({
      fetchers, fs, env: {}, dataDir: DATA_DIR, now: () => FIXED_NOW
    });

    expect(manifest.sources.spxWeekdays.status).toBe("stale");
    expect(manifest.sources.spxWeekdays.errorMessage).toMatch(/5000|insufficient/i);
    // None of the 18 variants should have been written
    for (const range of ["1m","3m","6m","ytd","1y","2y","5y","10y","all"]) {
      for (const method of ["openClose","closeClose"]) {
        expect(fs.writes.has(`${DATA_DIR}/spx-weekdays/${range}-${method}.json`)).toBe(false);
      }
    }
  });

  test("generatedBy populates from env vars in CI mode", async () => {
    const fs = makeFs();
    const fetchers: Fetchers = {
      shiller: async () => buildValidShillerData(),
      buffett: async () => buildValidBuffettData(),
      spxRawPayload: async () => buildValidSpxRawPayload()
    };

    const manifest = await generateStaticData({
      fetchers, fs, dataDir: DATA_DIR, now: () => FIXED_NOW,
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: "abc123",
        GITHUB_RUN_ID: "9876",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "user/market-atlas"
      }
    });

    expect(manifest.generatedBy.ref).toBe("refs/heads/main");
    expect(manifest.generatedBy.sha).toBe("abc123");
    expect(manifest.generatedBy.runId).toBe("9876");
    expect(manifest.generatedBy.runUrl).toBe("https://github.com/user/market-atlas/actions/runs/9876");
  });

  test("generatedBy defaults to 'local' when no env present", async () => {
    const fs = makeFs();
    const fetchers: Fetchers = {
      shiller: async () => buildValidShillerData(),
      buffett: async () => buildValidBuffettData(),
      spxRawPayload: async () => buildValidSpxRawPayload()
    };

    const manifest = await generateStaticData({
      fetchers, fs, env: {}, dataDir: DATA_DIR, now: () => FIXED_NOW
    });

    expect(manifest.generatedBy.ref).toBe("local");
    expect(manifest.generatedBy.sha).toBeNull();
    expect(manifest.generatedBy.runId).toBeNull();
    expect(manifest.generatedBy.runUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/generate-static-data.test.ts
```

Expected: all tests fail with "Failed to load url ../lib/generate-static-data".

- [ ] **Step 3: Implement `lib/generate-static-data.ts`**

```typescript
import {
  fetchShillerData,
  SHILLER_SOURCE_URLS,
  FRED_SP500_URL,
  NASDAQ_SPY_SOURCE_URL
} from "./shiller";
import {
  fetchBuffettData,
  FRED_MARKET_VALUE_URL,
  FRED_GDP_URL,
  FRED_WORLD_GDP_URL,
  WORLD_BANK_MARKET_VALUE_URL
} from "./buffett";
import {
  fetchYahooSpxChartJson,
  parseYahooSpxChartJson,
  YAHOO_SPX_CHART_BASE_URL,
  type SpxDailyPrice
} from "./spx-source";
import {
  buildSpxWeekdayDataset,
  type SpxRange,
  type SpxReturnMethod
} from "./spx-weekdays";
import { ShillerDatasetSchema } from "./schemas/shiller";
import { BuffettDatasetSchema } from "./schemas/buffett";
import { SpxWeekdayPayloadSchema } from "./schemas/spx-weekdays";
import { ManifestSchema, type Manifest, type SourceStatus } from "./schemas/manifest";
import type { ZodSchema, ZodError } from "zod";

const SPX_RANGES: SpxRange[] = ["1m","3m","6m","ytd","1y","2y","5y","10y","all"];
const SPX_METHODS: SpxReturnMethod[] = ["openClose","closeClose"];
const MIN_SPX_PRICE_ROWS = 5000;

const SOURCE_META = {
  shiller: {
    displayName: "Shiller CAPE workbook",
    sourceUrls: [SHILLER_SOURCE_URLS[0], FRED_SP500_URL, NASDAQ_SPY_SOURCE_URL]
  },
  buffett: {
    displayName: "FRED Buffett indicator + World Bank",
    sourceUrls: [FRED_MARKET_VALUE_URL, FRED_GDP_URL, FRED_WORLD_GDP_URL, WORLD_BANK_MARKET_VALUE_URL]
  },
  spxWeekdays: {
    displayName: "Yahoo Finance SPX chart",
    sourceUrls: [YAHOO_SPX_CHART_BASE_URL]
  }
} as const;

export type Fetchers = {
  shiller: () => Promise<unknown>;
  buffett: () => Promise<unknown>;
  spxRawPayload: () => Promise<unknown>;
};

export type FileSystem = {
  readFile: (path: string) => Promise<string | null>;
  writeFile: (path: string, content: string) => Promise<void>;
};

export type EnvVars = {
  GITHUB_REF?: string;
  GITHUB_SHA?: string;
  GITHUB_RUN_ID?: string;
  GITHUB_SERVER_URL?: string;
  GITHUB_REPOSITORY?: string;
};

export type GenerateOptions = {
  fetchers: Fetchers;
  fs: FileSystem;
  env: EnvVars;
  dataDir: string;
  now?: () => Date;
};

export async function generateStaticData(options: GenerateOptions): Promise<Manifest> {
  const now = (options.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const priorManifest = await readPriorManifest(options.fs, options.dataDir);

  const shillerStatus = await processSimpleSource({
    sourceKey: "shiller",
    fetcher: options.fetchers.shiller,
    schema: ShillerDatasetSchema,
    filePath: joinPath(options.dataDir, "shiller.json"),
    priorStatus: priorManifest?.sources.shiller,
    extractLatestDate: (data: any) => data.points[data.points.length - 1]?.date ?? null,
    extractRowCount: (data: any) => data.points.length,
    fs: options.fs,
    nowIso
  });

  const buffettStatus = await processSimpleSource({
    sourceKey: "buffett",
    fetcher: options.fetchers.buffett,
    schema: BuffettDatasetSchema,
    filePath: joinPath(options.dataDir, "buffett.json"),
    priorStatus: priorManifest?.sources.buffett,
    extractLatestDate: (data: any) => data.points[data.points.length - 1]?.date ?? null,
    extractRowCount: (data: any) => data.points.length,
    fs: options.fs,
    nowIso
  });

  const spxWeekdaysStatus = await processSpxWeekdays({
    fetcher: options.fetchers.spxRawPayload,
    dataDir: options.dataDir,
    priorStatus: priorManifest?.sources.spxWeekdays,
    fs: options.fs,
    nowIso
  });

  const manifest: Manifest = {
    schemaVersion: 1,
    generatedAt: nowIso,
    generatedBy: buildGeneratedBy(options.env),
    validationTier: "L3",
    sources: {
      shiller: shillerStatus,
      buffett: buffettStatus,
      spxWeekdays: spxWeekdaysStatus
    }
  };

  await options.fs.writeFile(
    joinPath(options.dataDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const allFailed = Object.values(manifest.sources).every((s) => s.status === "failed");
  if (allFailed) {
    throw new Error("All sources failed and no committed fallback exists");
  }

  return manifest;
}

type ProcessSimpleArgs<T> = {
  sourceKey: "shiller" | "buffett";
  fetcher: () => Promise<unknown>;
  schema: ZodSchema<T>;
  filePath: string;
  priorStatus: SourceStatus | undefined;
  extractLatestDate: (data: T) => string | null;
  extractRowCount: (data: T) => number;
  fs: FileSystem;
  nowIso: string;
};

async function processSimpleSource<T>(args: ProcessSimpleArgs<T>): Promise<SourceStatus> {
  const meta = SOURCE_META[args.sourceKey];
  const baseFields = {
    displayName: meta.displayName,
    sourceUrls: [...meta.sourceUrls],
    lastAttemptedFetchAt: args.nowIso
  };

  try {
    const raw = await args.fetcher();
    const validated = args.schema.parse(raw);
    await args.fs.writeFile(args.filePath, `${JSON.stringify(validated)}\n`);
    return {
      ...baseFields,
      status: "ok",
      latestDate: args.extractLatestDate(validated),
      rowCount: args.extractRowCount(validated),
      lastSuccessfulFetchAt: args.nowIso,
      errorMessage: null
    };
  } catch (error) {
    const errorMessage = compactErrorMessage(error);
    const existing = await args.fs.readFile(args.filePath);
    if (existing === null) {
      return {
        ...baseFields,
        status: "failed",
        latestDate: null,
        rowCount: 0,
        lastSuccessfulFetchAt: null,
        errorMessage
      };
    }
    return {
      ...baseFields,
      status: "stale",
      latestDate: args.priorStatus?.latestDate ?? null,
      rowCount: args.priorStatus?.rowCount ?? 0,
      lastSuccessfulFetchAt: args.priorStatus?.lastSuccessfulFetchAt ?? null,
      errorMessage
    };
  }
}

type ProcessSpxArgs = {
  fetcher: () => Promise<unknown>;
  dataDir: string;
  priorStatus: SourceStatus | undefined;
  fs: FileSystem;
  nowIso: string;
};

async function processSpxWeekdays(args: ProcessSpxArgs): Promise<SourceStatus> {
  const meta = SOURCE_META.spxWeekdays;
  const baseFields = {
    displayName: meta.displayName,
    sourceUrls: [...meta.sourceUrls],
    lastAttemptedFetchAt: args.nowIso
  };

  try {
    const raw = await args.fetcher();
    const rows = parseYahooSpxChartJson(raw);
    if (rows.length < MIN_SPX_PRICE_ROWS) {
      throw new Error(`SPX raw payload has ${rows.length} rows; expected >= ${MIN_SPX_PRICE_ROWS}`);
    }

    // Build all 18 variants in memory, validate each, then write atomically.
    const variants: Array<{ range: SpxRange; method: SpxReturnMethod; payload: unknown }> = [];
    for (const range of SPX_RANGES) {
      for (const method of SPX_METHODS) {
        const dataset = buildSpxWeekdayDataset(rows, { range, method });
        const payloadForJson = {
          ...dataset,
          source: {
            key: "yahoo-spx-chart",
            name: meta.displayName,
            displayName: meta.displayName,
            provider: "Yahoo Finance",
            url: YAHOO_SPX_CHART_BASE_URL
          }
        };
        SpxWeekdayPayloadSchema.parse(payloadForJson);
        variants.push({ range, method, payload: payloadForJson });
      }
    }

    for (const v of variants) {
      const path = joinPath(args.dataDir, "spx-weekdays", `${v.range}-${v.method}.json`);
      await args.fs.writeFile(path, `${JSON.stringify(v.payload)}\n`);
    }

    return {
      ...baseFields,
      status: "ok",
      latestDate: rows[rows.length - 1]?.date ?? null,
      rowCount: rows.length,
      lastSuccessfulFetchAt: args.nowIso,
      errorMessage: null
    };
  } catch (error) {
    const errorMessage = compactErrorMessage(error);

    // Check whether any committed variant exists (use 1y-openClose as a representative)
    const probePath = joinPath(args.dataDir, "spx-weekdays", "1y-openClose.json");
    const existing = await args.fs.readFile(probePath);

    if (existing === null) {
      return {
        ...baseFields,
        status: "failed",
        latestDate: null,
        rowCount: 0,
        lastSuccessfulFetchAt: null,
        errorMessage
      };
    }

    return {
      ...baseFields,
      status: "stale",
      latestDate: args.priorStatus?.latestDate ?? null,
      rowCount: args.priorStatus?.rowCount ?? 0,
      lastSuccessfulFetchAt: args.priorStatus?.lastSuccessfulFetchAt ?? null,
      errorMessage
    };
  }
}

async function readPriorManifest(fs: FileSystem, dataDir: string): Promise<Manifest | null> {
  const raw = await fs.readFile(joinPath(dataDir, "manifest.json"));
  if (raw === null) return null;
  try {
    return ManifestSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function buildGeneratedBy(env: EnvVars): Manifest["generatedBy"] {
  if (!env.GITHUB_REF) {
    return { ref: "local", sha: null, runId: null, runUrl: null };
  }
  const runUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;
  return {
    ref: env.GITHUB_REF,
    sha: env.GITHUB_SHA ?? null,
    runId: env.GITHUB_RUN_ID ?? null,
    runUrl
  };
}

function compactErrorMessage(error: unknown): string {
  if (error instanceof Error && "issues" in error) {
    const zod = error as ZodError;
    return zod.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function joinPath(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

// Default production wiring (used by scripts/generate-pages-data.mjs).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export const defaultFetchers: Fetchers = {
  shiller: fetchShillerData,
  buffett: fetchBuffettData,
  spxRawPayload: fetchYahooSpxChartJson
};

export const defaultFileSystem: FileSystem = {
  readFile: async (path) => {
    if (!existsSync(path)) return null;
    return readFile(path, "utf8");
  },
  writeFile: async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
};
```

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- tests/generate-static-data.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Wire `scripts/generate-pages-data.mjs` to the new orchestrator**

Replace the entire contents of `scripts/generate-pages-data.mjs` with:

```javascript
import { join } from "node:path";

const dataDir = join(process.cwd(), "public", "data");

const { generateStaticData, defaultFetchers, defaultFileSystem } = await import(
  "../lib/generate-static-data.ts"
);

const manifest = await generateStaticData({
  fetchers: defaultFetchers,
  fs: defaultFileSystem,
  env: process.env,
  dataDir
});

const failed = Object.entries(manifest.sources).filter(([, s]) => s.status !== "ok");
if (failed.length > 0) {
  console.warn(`Some sources are stale or failed:`);
  for (const [key, status] of failed) {
    console.warn(`  ${key}: ${status.status} — ${status.errorMessage}`);
  }
}

console.log(`Manifest written. Source statuses: ${
  Object.entries(manifest.sources).map(([k, s]) => `${k}=${s.status}`).join(", ")
}`);
```

- [ ] **Step 6: Run the script locally**

```bash
npm run generate:pages-data
```

Expected: console output shows `Manifest written. Source statuses: shiller=ok, buffett=ok, spxWeekdays=ok`. New file at `public/data/manifest.json`. Existing `public/data/*.json` overwritten with freshly-validated content.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all tests pass, including the new `committed public/data passes its schemas` block (the just-regenerated files match the schemas because they came from the same generator).

- [ ] **Step 8: Commit the code**

```bash
git add lib/generate-static-data.ts tests/generate-static-data.test.ts \
        scripts/generate-pages-data.mjs
git commit -m "Add generate-static-data orchestrator with L3 validation"
```

---

### Task 5: First manifest commit (Commit B from spec Bootstrap)

**Files:**
- Stage: `public/data/manifest.json` (just generated in Task 4 Step 6)
- Stage: any updates to `public/data/*.json` that Task 4 Step 6 produced

This is Bootstrap **Commit B** from the spec. Step 6 of Task 4 already ran the generator and wrote the files; this task captures them as a separate commit so the diff is clean.

- [ ] **Step 1: Verify manifest exists and is well-formed**

Run:

```bash
ls -la public/data/manifest.json
jq -r '.sources | to_entries | .[] | "\(.key): \(.value.status)"' public/data/manifest.json
```

Expected: `manifest.json` ~3-5 KB, all three sources show `ok`.

- [ ] **Step 2: Stage and review changes**

Run:

```bash
git add public/data/
git status --short
git diff --cached --stat
```

Expected: `manifest.json` added; other `*.json` files possibly modified (regenerated content).

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
Generate initial public/data/manifest.json

First run of the new generate-static-data orchestrator against
live sources. All three sources validated under L3 and committed.

Bootstrap Commit B per
docs/superpowers/specs/2026-05-11-static-export-foundation-design.md
EOF
)"
```

---

## Chunk 3: Demolition and rewiring (Tasks 6–9)

### Task 6: Collapse data-loading abstractions (rewire consumers)

**Files:**
- Modify: `lib/pages-data.ts` (collapse to single read path)
- Modify: `lib/paths.ts` (delete `isStaticExport`)
- Modify: `next.config.mjs` (delete `NEXT_PUBLIC_STATIC_EXPORT`)
- Modify: `app/spx-weekdays/spx-weekday-dashboard.tsx` (collapse fetch URL, drop `database`/`warning` reads, refactor `SourceNote`, fix the badge logic at lines 196-197, fix the error-state link at line 269)
- Modify: `app/spx-weekdays/page.tsx` (pass manifest freshness as a prop)

**Order matters.** This task must come **before** Task 7 (demolition). Task 7 deletes `lib/spx-weekday-service.ts` and `lib/market-data/`, which today are still imported by `lib/pages-data.ts` and `app/spx-weekdays/spx-weekday-dashboard.tsx`. Once this task rewires those consumers to use `lib/pages-data.ts`'s manifest helpers and the trimmed `SpxWeekdayPayload` shape, Task 7's `git rm` leaves no dangling imports and the build stays green between commits.

`tests/spx-weekday-layout.test.ts` is a CSS-only test (reads `app/globals.css`); it does **not** use any `SpxWeekdayPayload` fixture and needs no edits.

- [ ] **Step 1: Rewrite `lib/pages-data.ts`**

Replace the entire contents with:

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ManifestSchema, type Manifest, type SourceStatus } from "./schemas/manifest";

const staticDataRoot = join(process.cwd(), "public", "data");

export async function readStaticJson<T>(relativePath: string): Promise<T> {
  const contents = await readFile(join(staticDataRoot, relativePath), "utf8");
  return JSON.parse(contents) as T;
}

export async function readManifest(): Promise<Manifest> {
  const text = await readFile(join(staticDataRoot, "manifest.json"), "utf8");
  return ManifestSchema.parse(JSON.parse(text));
}

export async function loadShillerPageDataset() {
  return readStaticJson<unknown>("shiller.json") as Promise<any>;
}

export async function loadBuffettPageDataset() {
  return readStaticJson<unknown>("buffett.json") as Promise<any>;
}

export async function loadSpxWeekdayPageDataset() {
  return readStaticJson<unknown>("spx-weekdays/1y-openClose.json") as Promise<any>;
}

export async function loadSpxWeekdayVariant(range: string, method: string) {
  return readStaticJson<unknown>(`spx-weekdays/${range}-${method}.json`) as Promise<any>;
}

export function sourceFreshnessFor(manifest: Manifest, key: keyof Manifest["sources"]): SourceStatus {
  return manifest.sources[key];
}
```

The return types are `Promise<any>` for now — the dashboard pages narrow at call-sites. The `isGithubPagesBuild` switch and the `loadSpxWeekdayData` import from `lib/spx-weekday-service` are both gone.

- [ ] **Step 2: Delete `isStaticExport` from `lib/paths.ts`**

Replace `lib/paths.ts` contents with:

```typescript
export const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? "");

export function withBasePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return path;
  }
  return `${basePath}${path}` || path;
}

function normalizeBasePath(path: string): string {
  if (!path || path === "/") {
    return "";
  }
  return path.startsWith("/") ? path.replace(/\/$/, "") : `/${path.replace(/\/$/, "")}`;
}
```

- [ ] **Step 3: Delete `NEXT_PUBLIC_STATIC_EXPORT` from `next.config.mjs`**

Modify the `env` block inside the `isGithubPages` conditional:

```javascript
        env: {
          NEXT_PUBLIC_BASE_PATH: githubPagesBasePath
        }
```

(Drop the `NEXT_PUBLIC_STATIC_EXPORT: "true"` line.)

- [ ] **Step 4: Trim `SpxWeekdayPayload` shape and add `SourceFreshness` type**

In `app/spx-weekdays/spx-weekday-dashboard.tsx`, find the file's type imports from `lib/spx-weekday-service` (line 4). That module is being deleted. Replace with a local type definition at the top of the file:

```typescript
import type {
  SpxRange,
  SpxReturnMethod,
  SpxWeekdayDataset,
  SpxWeekdayReturn,
  SpxWeekdayStat,
  WeekdayName
} from "../../lib/spx-weekdays";

export type SpxWeekdayPayload = SpxWeekdayDataset & {
  source: {
    key: string;
    name: string;
    displayName: string;
    provider: string;
    url: string;
  };
};

export type SourceFreshness = {
  lastSuccessfulFetchAt: string | null;
  lastAttemptedFetchAt: string;
  latestDate: string | null;
  rowCount: number;
  status: "ok" | "stale" | "failed";
  errorMessage: string | null;
};
```

Verify `SpxWeekdayDataset` is exported from `lib/spx-weekdays.ts`:

```bash
grep "export type SpxWeekdayDataset" lib/spx-weekdays.ts
```

Expected: one match. (If not, add `export` to the existing `type SpxWeekdayDataset = ...` declaration.)

- [ ] **Step 5: Update the workbench panel header badge AND `SourceNote`**

In `app/spx-weekdays/spx-weekday-dashboard.tsx`, find the badge near the top of the rendered tree (~lines 196-197):

```typescript
<span className={`statusBadge ${dataset.warning || errorMessage ? "amber" : "green"}`}>
  {isLoading ? "Updating" : dataset.warning || errorMessage ? "Needs review" : "Fresh view"}
</span>
```

Replace with:

```typescript
<span className={`statusBadge ${(freshness && freshness.status !== "ok") || errorMessage ? "amber" : "green"}`}>
  {isLoading
    ? "Updating"
    : freshness && freshness.status !== "ok"
      ? "Source stale"
      : errorMessage
        ? "Needs review"
        : "Fresh view"}
</span>
```

Then find the `SourceNote` function (later in the file). Currently:

```typescript
function SourceNote({ dataset, fetchError }: { dataset: SpxWeekdayPayload; fetchError: string | null }) {
  return (
    <section className="sourceNote panel">
      <p className="eyebrow">Source freshness</p>
      <p>
        Local cache covers {dataset.database.firstDate ...} ...
      </p>
      <p className="sourceLine">
        Source fetched from <a href={dataset.source.url}>{dataset.source.displayName}</a>
        {dataset.database.latestFetchedAt ? `; latest row fetched ${formatDateTime(dataset.database.latestFetchedAt)}` : ""}
        {dataset.database.lastSuccessfulRefreshAt ? `; last refresh ${formatDateTime(dataset.database.lastSuccessfulRefreshAt)}` : ""}.
      </p>
      {dataset.warning ? ... : null}
      {fetchError ? ... : null}
    </section>
  );
}
```

Replace with:

```typescript
function SourceNote({
  dataset,
  freshness,
  fetchError
}: {
  dataset: SpxWeekdayPayload;
  freshness: SourceFreshness;
  fetchError: string | null;
}) {
  return (
    <section className="sourceNote panel">
      <p className="eyebrow">Source freshness</p>
      <p>
        Showing data through {freshness.latestDate ? formatDay(freshness.latestDate) : "n/a"}{" "}
        ({freshness.rowCount.toLocaleString()} daily rows).
      </p>
      <p className="sourceLine">
        Source: <a href={dataset.source.url}>{dataset.source.displayName}</a>
        {freshness.lastSuccessfulFetchAt
          ? `; last successful fetch ${formatDateTime(freshness.lastSuccessfulFetchAt)}`
          : ""}
        .
      </p>
      {freshness.status !== "ok" && freshness.errorMessage ? (
        <p className="weekdayWarning">Source warning: {freshness.errorMessage}</p>
      ) : null}
      {fetchError ? (
        <p className="weekdayWarning">Update failed: {fetchError}</p>
      ) : null}
    </section>
  );
}
```

After these two updates, search the file once more for any remaining `dataset.database` or `dataset.warning` reference and remove or replace.

- [ ] **Step 6: Collapse `getSpxWeekdayDataUrl` and fix the error-state link**

Find:

```typescript
function getSpxWeekdayDataUrl(range: SpxRange, method: SpxReturnMethod): string {
  return isStaticExport
    ? withBasePath(`/data/spx-weekdays/${range}-${method}.json`)
    : withBasePath(`/api/spx-weekdays?range=${range}&method=${method}`);
}
```

Replace with:

```typescript
function getSpxWeekdayDataUrl(range: SpxRange, method: SpxReturnMethod): string {
  return withBasePath(`/data/spx-weekdays/${range}-${method}.json`);
}
```

Remove the `isStaticExport` import at the top of the file (it's no longer exported from `lib/paths.ts`).

Then find the error-state link near the bottom of the dashboard (~line 269):

```tsx
<a href={getSpxWeekdayDataUrl("1y", "openClose")}>Check the data endpoint</a>
```

Replace with:

```tsx
<a href={withBasePath("/data")}>Check data status</a>
```

This aligns with the spec's error-state policy (link to `/data`, not a raw JSON file).

- [ ] **Step 7: Update `app/spx-weekdays/page.tsx`**

Replace the file with:

```tsx
import { SpxWeekdayDashboard, type SourceFreshness, type SpxWeekdayPayload } from "./spx-weekday-dashboard";
import { loadSpxWeekdayPageDataset, readManifest } from "../../lib/pages-data";

export const metadata = {
  title: "SPX weekdays | Market Atlas"
};

export default async function SpxWeekdaysPage() {
  try {
    const [initialDataset, manifest] = await Promise.all([
      loadSpxWeekdayPageDataset() as Promise<SpxWeekdayPayload>,
      readManifest()
    ]);
    const freshness: SourceFreshness = manifest.sources.spxWeekdays;

    return <SpxWeekdayDashboard initialDataset={initialDataset} freshness={freshness} />;
  } catch (error) {
    return (
      <SpxWeekdayDashboard
        initialDataset={null}
        freshness={null}
        initialError={
          error instanceof Error
            ? error.message
            : "Unable to load SPX weekday performance data"
        }
      />
    );
  }
}
```

- [ ] **Step 8: Update `SpxWeekdayDashboardProps` and pass freshness through**

In `app/spx-weekdays/spx-weekday-dashboard.tsx`, update the props type:

```typescript
type SpxWeekdayDashboardProps = {
  initialDataset: SpxWeekdayPayload | null;
  freshness: SourceFreshness | null;
  initialError?: string | null;
};
```

Destructure `freshness` from props at the top of the component. Pass `freshness` to `<SourceNote>`. The `SourceNote` is only rendered when `dataset` is truthy; when `freshness` is null (error path), it's never reached.

- [ ] **Step 9: Verify no stale imports or field reads remain**

```bash
grep -rn "isStaticExport\|spx-weekday-service\|dataset\.database\|dataset\.warning" app/ lib/ 2>/dev/null
```

Expected: no matches (the only remaining `spx-weekday-service` reference should be the about-to-be-deleted `lib/spx-weekday-service.ts` file itself, which the `lib/` portion of the grep won't match because — wait, it will. So the only legal match is `lib/spx-weekday-service.ts` itself).

Refined version:

```bash
grep -rn "isStaticExport\|dataset\.database\|dataset\.warning" app/ lib/ 2>/dev/null
grep -rn "spx-weekday-service" app/ 2>/dev/null
```

Expected: both empty.

- [ ] **Step 10: Verify tests + build**

```bash
npm test
npm run build
```

Expected: all tests pass; build succeeds. If a typecheck error references `database`, `warning`, or `isStaticExport`, fix the remaining reference and re-run.

- [ ] **Step 11: Commit**

```bash
git add lib/pages-data.ts lib/paths.ts next.config.mjs \
        app/spx-weekdays/page.tsx app/spx-weekdays/spx-weekday-dashboard.tsx
git commit -m "$(cat <<'EOF'
Collapse data-loading abstractions to single static read path

- lib/pages-data.ts reduces to readStaticJson + readManifest;
  isGithubPagesBuild branch deleted
- lib/paths.ts drops isStaticExport (no consumer remaining)
- next.config.mjs drops NEXT_PUBLIC_STATIC_EXPORT env export
- SpxWeekdayPayload loses database + warning fields; dashboard
  takes freshness as a prop from the server page that reads the
  manifest at build time
- getSpxWeekdayDataUrl collapses to /data/spx-weekdays/* only
- Workbench badge logic and error-state link refactored to use
  freshness/errorMessage instead of dataset.warning
EOF
)"
```

---

### Task 7: Demolish app/api/, lib/market-data/, lib/spx-weekday-service.ts, cache wrappers, rename hack

**Files:**
- Delete: `app/api/shiller/route.ts`, `app/api/buffett/route.ts`, `app/api/spx-weekdays/route.ts`, `app/api/` (directory)
- Delete: `lib/market-data/db.ts`, `lib/market-data/sources.ts`, `lib/market-data/spx-repository.ts`, `lib/market-data/` (directory)
- Delete: `lib/spx-weekday-service.ts`, `tests/market-data.test.ts`, `tests/spx-weekday-service.test.ts`
- Delete: `data/` directory (if it contains only `.sqlite*` artifacts)
- Modify: `scripts/build-pages.mjs` (remove rename hack)
- Modify: `lib/shiller.ts` (remove 6h cache wrapper)
- Modify: `lib/buffett.ts` (remove cache wrapper)
- Modify: `next-env.d.ts` (reset path drift if still present)

After Task 6 rewired all consumers, nothing imports the legacy code. This task removes it.

- [ ] **Step 1: Verify no consumers remain (Task 6 should have cleared them)**

```bash
grep -rn "lib/spx-weekday-service" app/ lib/ scripts/ tests/ 2>/dev/null \
  | grep -v "^lib/spx-weekday-service.ts"
grep -rn "lib/market-data" app/ lib/ scripts/ tests/ 2>/dev/null \
  | grep -v "^lib/market-data/\|^lib/spx-weekday-service.ts\|^tests/market-data.test.ts"
grep -rn '"\.\./\.\./api\|"\.\./api' app/ lib/ scripts/ tests/ 2>/dev/null
```

Expected: all three return **empty**. The only references to the about-to-be-deleted modules should be inside the files being deleted themselves.

If any grep returns content, **stop**. Task 6 missed a consumer — go back and fix Task 6 before continuing.

- [ ] **Step 2: Delete the SQLite layer + service + their tests**

```bash
git rm -r app/api lib/market-data \
         lib/spx-weekday-service.ts \
         tests/market-data.test.ts \
         tests/spx-weekday-service.test.ts
rm -rf data
```

- [ ] **Step 3: Simplify `scripts/build-pages.mjs`**

Replace the entire contents with:

```javascript
import { spawn } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const nextBin = join(root, "node_modules", ".bin", "next");

const child = spawn(nextBin, ["build"], {
  env: { ...process.env, GITHUB_PAGES: "true" },
  stdio: "inherit"
});

const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", resolve);
});

if (exitCode !== 0) {
  throw new Error(`GitHub Pages build failed with exit code ${exitCode}`);
}
```

- [ ] **Step 4: Delete the 6h cache wrapper in `lib/shiller.ts`**

In `lib/shiller.ts`, find:

```typescript
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

let cachedDataset: { expiresAt: number; data: ShillerDataset } | undefined;

export async function fetchShillerData(): Promise<ShillerDataset> {
  if (cachedDataset && cachedDataset.expiresAt > Date.now()) {
    return cachedDataset.data;
  }

  let lastError: unknown;

  for (const sourceUrl of SHILLER_SOURCE_URLS) {
    try {
      // ... existing fetch + parse logic ...

      const data = { ... };

      cachedDataset = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data
      };

      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to fetch Shiller data");
}
```

Remove:
- The `CACHE_TTL_MS` constant.
- The `cachedDataset` module-level variable.
- The `if (cachedDataset && ...) return cachedDataset.data;` block at the top of `fetchShillerData`.
- The `cachedDataset = { expiresAt: ..., data };` assignment just before `return data`.

Keep the rest of the function (the fetch+parse+merge logic and the `for` loop over `SHILLER_SOURCE_URLS`).

- [ ] **Step 5: Delete the cache wrapper in `lib/buffett.ts`**

Same pattern: remove the `CACHE_TTL_MS` constant, the `cachedDataset` variable, the cache-hit early-return at the top of `fetchBuffettData`, and the cache-write assignment before `return data`.

- [ ] **Step 6: Restore `next-env.d.ts`**

If the file currently has `import "./.next/dev/types/routes.d.ts";`, restore it to the canonical:

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

(Next will regenerate as needed on next dev/build.)

- [ ] **Step 7: Verify tests pass and build works**

```bash
npm test
npm run build
```

Expected: all tests pass (the deleted tests are gone; the rest still pass); `next build` completes without the rename hack.

- [ ] **Step 8: Verify `data/` directory is cleaned**

```bash
ls data 2>&1 || echo "data/ is gone — good"
```

Expected: "data/ is gone".

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Demolish app/api, lib/market-data, SQLite cache layer

The unified-static model has no consumer for any of this:
- app/api/* routes were stripped from production by the rename
  hack in scripts/build-pages.mjs and never served from Pages
- lib/market-data/* and lib/spx-weekday-service.ts existed only
  to back the API routes (consumers rewired in the prior commit)
- The 6h in-memory caches in lib/shiller.ts and lib/buffett.ts
  hold no state under one-fetch-per-build
- scripts/build-pages.mjs needed the rename hack to keep API
  routes out of static export; with them gone, the script
  reduces to "next build"

Also restores next-env.d.ts to the canonical routes.d.ts path.

Tests for deleted modules are removed.
EOF
)"
```

---

### Task 8: Page nav and error-state updates

**Files:**
- Modify: `app/page.tsx`, `app/chart/page.tsx`, `app/buffett/page.tsx`, `app/spx-weekdays/page.tsx`
- Modify: `app/dashboard.tsx`, `app/chart/detailed-chart.tsx`, `app/buffett/buffett-dashboard.tsx`, `app/spx-weekdays/spx-weekday-dashboard.tsx`

Nav links replace `/#about` with `/data`. Error-state links replace `/api/*` with `/data` or `/data/*.json`. The `revalidate` exports go (they're no-ops under static export).

- [ ] **Step 1: Update `app/page.tsx`**

Apply these edits:
- Delete the line `export const revalidate = 21600;`.
- In the nav (inside the `<nav>` in the error-state branch), replace `<a href="#about">About</a>` with `<a href={withBasePath("/data")}>Data sources</a>`.
- In the error-state `<a>` near the bottom, change `href={withBasePath("/api/shiller")}` to `href={withBasePath("/data")}`.

- [ ] **Step 2: Update `app/chart/page.tsx`**

- Delete `export const revalidate = 21600;`.
- In the nav (error-state branch), replace `<a href={withBasePath("/#about")}>...</a>` with `<a href={withBasePath("/data")}>Data sources</a>`.
- Change error-state `href={withBasePath("/api/shiller")}` to `href={withBasePath("/data")}`.

- [ ] **Step 3: Update `app/buffett/page.tsx`**

- Delete `export const revalidate = 21600;`.
- Nav: replace `<a href={withBasePath("/#about")}>...</a>` with `<a href={withBasePath("/data")}>Data sources</a>`.
- Error-state link: `/api/buffett` → `/data`.

- [ ] **Step 4: Update `app/spx-weekdays/page.tsx`**

(Already updated in Task 7 Step 7 — verify nav has `/data` link and no `/api/*` references.)

- [ ] **Step 5: Update `app/dashboard.tsx`**

In the `<nav>` block, replace `<a href="#about">About</a>` (or `<a href={withBasePath("/#about")}>...</a>`) with `<a href={withBasePath("/data")}>Data sources</a>`.

- [ ] **Step 6: Update `app/chart/detailed-chart.tsx`**

In the `<nav>` block, replace `<a href={withBasePath("/#about")}>Data sources</a>` with `<a href={withBasePath("/data")}>Data sources</a>`.

- [ ] **Step 7: Update `app/buffett/buffett-dashboard.tsx`**

Same nav edit: `/#about` → `/data`.

- [ ] **Step 8: Update `app/spx-weekdays/spx-weekday-dashboard.tsx`**

Same nav edit: `/#about` → `/data`. Plus add `aria-current="page"` on the `/spx-weekdays` link (it already has this; verify).

- [ ] **Step 9: Add `aria-current="page"` on each page's active nav link**

In each of the four `*-dashboard.tsx` files and `app/page.tsx`, add `aria-current="page"` to the nav link whose `href` matches the current page (e.g., on the home dashboard, add it to the Dashboard link; on the chart workbench, the Detailed-chart link; etc.).

- [ ] **Step 10: Verify build**

```bash
npm run build
```

Expected: build completes with no TS errors. Visual inspection isn't necessary at this stage — the smoke test in Task 10 will catch missing routes.

- [ ] **Step 11: Commit**

```bash
git add app/
git commit -m "$(cat <<'EOF'
Update page nav and error-state links

- Nav /#about anchor replaced with /data route across all pages
- Error states stop linking to /api/* (which is stripped from
  static export) and point to /data instead
- aria-current="page" added on active nav link for each route
- revalidate exports dropped (no-op under output: "export")
EOF
)"
```

---

### Task 9: `/data` route

**Files:**
- Create: `app/data/page.tsx`
- Modify: `app/globals.css`

Server component reading the manifest at build time. No client JS.

- [ ] **Step 1: Create `app/data/page.tsx`**

```tsx
import { readManifest } from "../../lib/pages-data";
import { formatDateTime, formatDay } from "../../lib/format";
import { withBasePath } from "../../lib/paths";
import type { Manifest, SourceStatus } from "../../lib/schemas/manifest";

export const metadata = { title: "Data & Methodology | Market Atlas" };

export default async function DataPage() {
  let manifest: Manifest | null = null;
  let loadError: string | null = null;
  try {
    manifest = await readManifest();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load manifest";
  }

  return (
    <main className="shell chartShell">
      <header className="topbar">
        <a className="brand" href={withBasePath("/")}>
          <span className="brandMark" aria-hidden="true" />
          Market Atlas
        </a>
        <nav aria-label="Primary navigation">
          <a href={withBasePath("/")}>Dashboard</a>
          <a href={withBasePath("/chart")}>CAPE chart</a>
          <a href={withBasePath("/buffett")}>Buffett indicator</a>
          <a href={withBasePath("/spx-weekdays")}>SPX weekdays</a>
          <a href={withBasePath("/data")} aria-current="page">Data sources</a>
        </nav>
      </header>

      <section className="workbenchIntro">
        <div>
          <p className="eyebrow">Static dashboard</p>
          <h1>Data sources &amp; freshness</h1>
          <p>
            Datasets are regenerated and committed to this repo each weekday after
            market close, then deployed by GitHub Actions. Each source falls back to
            the prior committed snapshot if a fetch fails.
          </p>
        </div>
      </section>

      {manifest ? (
        <>
          <BuildMetadataStrip manifest={manifest} />
          <section className="dataSourceList" aria-label="Data sources">
            <SourceCard
              source={manifest.sources.shiller}
              downloads={[{ label: "shiller.json", path: "/data/shiller.json" }]}
            />
            <SourceCard
              source={manifest.sources.buffett}
              downloads={[{ label: "buffett.json", path: "/data/buffett.json" }]}
            />
            <SourceCard
              source={manifest.sources.spxWeekdays}
              downloads={spxWeekdayDownloads()}
              spxVariants
            />
          </section>
          <section className="sourceNote panel">
            <p className="eyebrow">Methodology</p>
            <p>
              Validation: L3 (Zod schema + sanity bounds). When a source fails
              validation or a fetch errors, its prior committed JSON is preserved
              and flagged stale here until the source recovers.
            </p>
          </section>
        </>
      ) : (
        <section className="errorState panel">
          <p className="eyebrow">Manifest unavailable</p>
          <h1>The data manifest could not be loaded.</h1>
          <p>{loadError}</p>
        </section>
      )}
    </main>
  );
}

function BuildMetadataStrip({ manifest }: { manifest: Manifest }) {
  return (
    <section className="buildMetadataStrip panel">
      <div>
        <p className="eyebrow">Generated</p>
        <strong>{formatDateTime(manifest.generatedAt)}</strong>
      </div>
      <div>
        <p className="eyebrow">From</p>
        {manifest.generatedBy.runUrl ? (
          <a href={manifest.generatedBy.runUrl}>
            Workflow run #{manifest.generatedBy.runId}
          </a>
        ) : (
          <span>local build</span>
        )}
      </div>
      <div>
        <p className="eyebrow">Validation</p>
        <strong>{manifest.validationTier}</strong>
      </div>
    </section>
  );
}

function SourceCard({
  source,
  downloads,
  spxVariants
}: {
  source: SourceStatus;
  downloads: Array<{ label: string; path: string }>;
  spxVariants?: boolean;
}) {
  const badgeClass =
    source.status === "ok" ? "green" : source.status === "stale" ? "amber" : "red";
  const [primaryUrl, ...additionalUrls] = source.sourceUrls;

  return (
    <article className="panel sourceCard">
      <div className="panelHeader">
        <h2>{source.displayName}</h2>
        <span className={`statusBadge ${badgeClass}`} aria-label={`Status: ${source.status}`}>
          {source.status}
        </span>
      </div>
      <dl>
        <dt>Last successful fetch</dt>
        <dd>
          {source.lastSuccessfulFetchAt
            ? formatDateTime(source.lastSuccessfulFetchAt)
            : "never"}
        </dd>
        {source.status !== "ok" ? (
          <>
            <dt>Last attempted</dt>
            <dd>{formatDateTime(source.lastAttemptedFetchAt)}</dd>
          </>
        ) : null}
        <dt>Latest data row</dt>
        <dd>
          {source.latestDate ? `${formatDay(source.latestDate)} · ${source.rowCount.toLocaleString()} rows` : "no data"}
        </dd>
        <dt>Primary source</dt>
        <dd>
          <a href={primaryUrl} title={primaryUrl}>{hostOf(primaryUrl)}</a>
        </dd>
        {additionalUrls.length > 0 ? (
          <>
            <dt>Additional sources</dt>
            <dd>
              {additionalUrls.map((url, i) => (
                <span key={url}>
                  {i > 0 ? ", " : null}
                  <a href={url} title={url}>{hostOf(url)}</a>
                </span>
              ))}
            </dd>
          </>
        ) : null}
        {source.errorMessage ? (
          <>
            <dt>Error</dt>
            <dd className="weekdayWarning">{source.errorMessage}</dd>
          </>
        ) : null}
      </dl>
      <div className="downloadLinks">
        {spxVariants ? (
          <details>
            <summary>Weekday-stat variants ({downloads.length})</summary>
            <ul>
              {downloads.map((d) => (
                <li key={d.path}>
                  <a href={withBasePath(d.path)} download>{d.label}</a>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <ul>
            {downloads.map((d) => (
              <li key={d.path}>
                <a href={withBasePath(d.path)} download>{d.label}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function spxWeekdayDownloads() {
  const ranges = ["1m","3m","6m","ytd","1y","2y","5y","10y","all"];
  const methods = ["openClose","closeClose"];
  const items: Array<{ label: string; path: string }> = [];
  for (const range of ranges) {
    for (const method of methods) {
      items.push({
        label: `${range}-${method}.json`,
        path: `/data/spx-weekdays/${range}-${method}.json`
      });
    }
  }
  return items;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
```

- [ ] **Step 2: Add CSS classes to `app/globals.css`**

Append to the file:

```css
.buildMetadataStrip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  padding: 18px 22px;
  margin-top: 18px;
}

.buildMetadataStrip strong,
.buildMetadataStrip a {
  display: block;
  font-size: 1.04rem;
  font-weight: 800;
}

.dataSourceList {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  margin-top: 18px;
}

.sourceCard {
  padding: 22px;
}

.sourceCard dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 18px;
  margin: 14px 0 12px;
  font-size: 0.94rem;
}

.sourceCard dt {
  color: var(--muted);
  font-weight: 800;
}

.sourceCard dd {
  margin: 0;
  color: var(--ink);
}

.downloadLinks ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.downloadLinks a {
  color: var(--teal-dark);
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.downloadLinks details ul {
  margin-top: 10px;
  flex-direction: column;
  gap: 4px;
}

.topbar nav a[aria-current="page"] {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 4px;
}

@media (max-width: 720px) {
  .buildMetadataStrip {
    grid-template-columns: 1fr;
  }
  .sourceCard dl {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Build and verify the route is generated**

```bash
npm run build:pages
ls -la out/data/
```

Expected: `out/data/index.html` exists; `out/data/*.json` files copied from `public/data/`.

- [ ] **Step 4: Manually inspect the route locally**

```bash
npm run dev
# Open http://localhost:3000/data in a browser
```

Expected: source-status table renders with three cards, status badges show `ok`, build-metadata strip shows `local build`, downloads expand for SPX variants.

- [ ] **Step 5: Commit**

```bash
git add app/data/ app/globals.css
git commit -m "Add /data route surfacing manifest and downloads"
```

---

## Chunk 4: Verification and shipping (Tasks 10–13)

### Task 10: Smoke test (`scripts/test-static-export.ts`)

**Files:**
- Create: `scripts/test-static-export.ts`
- Modify: `package.json` (add `test:static` script)

Pure Node script run after `npm run build:pages`. Verifies routes, data files, manifest schema, and absence of `/api/` substrings.

- [ ] **Step 1: Create `scripts/test-static-export.ts`**

```typescript
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ManifestSchema } from "../lib/schemas/manifest";

const out = join(process.cwd(), "out");
let failed = false;

function check(condition: boolean, label: string) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failed = true;
  }
}

const requiredRoutes = [
  "index.html",
  "chart/index.html",
  "buffett/index.html",
  "spx-weekdays/index.html",
  "data/index.html"
];
for (const route of requiredRoutes) {
  check(existsSync(join(out, route)), `route exists: ${route}`);
}

const requiredData: string[] = [
  "data/manifest.json",
  "data/shiller.json",
  "data/buffett.json"
];
const ranges = ["1m","3m","6m","ytd","1y","2y","5y","10y","all"];
const methods = ["openClose","closeClose"];
for (const r of ranges) {
  for (const m of methods) {
    requiredData.push(`data/spx-weekdays/${r}-${m}.json`);
  }
}
for (const file of requiredData) {
  check(existsSync(join(out, file)), `data file exists: ${file}`);
}

try {
  const text = readFileSync(join(out, "data/manifest.json"), "utf8");
  ManifestSchema.parse(JSON.parse(text));
  check(true, "manifest.json matches schema");
} catch (error) {
  check(false, `manifest.json schema: ${(error as Error).message}`);
}

const apiPattern = /["'`(]\s*\/api\//;
async function* walkFiles(dir: string, extensions: string[]): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full, extensions);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      yield full;
    }
  }
}

let apiLeakCount = 0;
for await (const file of walkFiles(out, [".html", ".js"])) {
  const text = readFileSync(file, "utf8");
  if (apiPattern.test(text)) {
    apiLeakCount++;
    console.error(`     /api/ reference found in: ${file.replace(out, "out")}`);
  }
}
check(apiLeakCount === 0, `no /api/ references in built HTML or JS (found ${apiLeakCount})`);

const indexHtml = readFileSync(join(out, "index.html"), "utf8");
check(
  indexHtml.includes("/market-atlas/"),
  "index.html contains /market-atlas/ basePath references"
);

if (failed) {
  console.error("\nSmoke test FAILED");
  process.exit(1);
}
console.log("\nSmoke test passed");
```

- [ ] **Step 2: Add `test:static` script to `package.json`**

In the `"scripts"` block, add:

```json
"test:static": "tsx scripts/test-static-export.ts"
```

Final `scripts` block should look like:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "build:pages": "npm run generate:pages-data && node scripts/build-pages.mjs",
  "generate:pages-data": "tsx scripts/generate-pages-data.mjs",
  "start": "next start",
  "test": "vitest run",
  "test:static": "tsx scripts/test-static-export.ts"
}
```

- [ ] **Step 3: Run the smoke test against an existing build**

```bash
npm run build:pages
npm run test:static
```

Expected: every check `PASS`s; final line `Smoke test passed`.

- [ ] **Step 4: Verify it catches a regression by injecting a stray `/api/` reference**

(This is a sanity check; revert after.)

```bash
echo '<script>fetch("/api/whatever")</script>' >> out/index.html
npm run test:static
```

Expected: `FAIL  no /api/ references in built HTML or JS (found 1)`; exit code 1.

Revert:

```bash
npm run build:pages
```

Expected: index.html restored.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-static-export.ts package.json
git commit -m "Add post-build static-export smoke test"
```

---

### Task 11: CI workflow

**Files:**
- Modify: `.github/workflows/deploy-pages.yml`

Add `contents: write`, the generate / unit-test / smoke / auto-commit steps. Retain the cron-comment block.

- [ ] **Step 1: Replace `.github/workflows/deploy-pages.yml`**

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:
  schedule:
    # GitHub cron uses UTC.
    #
    # 7:30 PM America/Chicago (CDT, UTC-5)  => 00:30 UTC next day
    # 7:30 PM America/Chicago (CST, UTC-6)  => 01:30 UTC next day
    #
    # We schedule both and use the should-deploy guard to only proceed
    # when local America/Chicago time matches 19:30.
    - cron: "30 0 * * 2-6" # Tue-Sat UTC => Mon-Fri local
    - cron: "30 1 * * 2-6" # Tue-Sat UTC => Mon-Fri local

permissions:
  contents: write
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
      - name: Check scheduled deploy time
        id: schedule-check
        shell: bash
        run: |
          if [[ "${{ github.event_name }}" != "schedule" ]]; then
            echo "run=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          local_hour="$(TZ=America/Chicago date +%H)"
          local_minute="$(TZ=America/Chicago date +%M)"
          if [[ "$local_hour" == "19" && "$local_minute" == "30" ]]; then
            echo "run=true" >> "$GITHUB_OUTPUT"
          else
            echo "run=false" >> "$GITHUB_OUTPUT"
          fi

  build:
    needs: should-deploy
    if: needs.should-deploy.outputs.run == 'true'
    runs-on: ubuntu-latest
    env:
      GITHUB_PAGES: "true"
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Generate + validate static data
        run: npm run generate:pages-data

      - name: Unit tests
        run: npm test

      - name: Configure Pages
        uses: actions/configure-pages@v6

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
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 2: Verify YAML parses**

```bash
node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy-pages.yml','utf8'))" 2>&1 || echo "(js-yaml not installed; skip)"
```

If `js-yaml` isn't available, skip this check — GitHub will validate on push.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "$(cat <<'EOF'
Update workflow for unified static-export pipeline

- permissions.contents: read → write (auto-commit refreshed data)
- New steps: generate-pages-data (with L3 validation), npm test,
  test:static (smoke test), auto-commit
- auto-commit fires on schedule or workflow_dispatch only; push
  events skip to avoid muddying code-change PRs
- [skip ci] tag on data commits prevents re-trigger loop
- Cron-comment block retained for DST clarity
EOF
)"
```

---

### Task 12: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md` to reflect the new model**

Replace the entire contents with:

```markdown
# Market Atlas

A personal market dashboard demo. Shiller PE, Buffett indicator, SPX weekday performance — all driven by static data committed to this repo and refreshed daily by GitHub Actions.

## What it does

- Renders three valuation/research dashboards: CAPE (Shiller PE), Buffett indicator, and SPX weekday performance.
- Adds a detailed comparison chart for realized one-year-ahead forward PE versus SPX price.
- Generates per-source datasets at build time from public sources (Shiller workbook, FRED, World Bank, Yahoo Finance).
- Validates every generated dataset with Zod (L3: schema + sanity bounds).
- Surfaces per-source freshness at the `/data` route via `public/data/manifest.json`.
- Falls back to the prior committed snapshot when a source fetch fails; the manifest flags that source as `stale`.

## Run locally

```bash
npm install
npm run dev                    # uses committed public/data/*.json
npm run generate:pages-data    # optional — refresh from live sources
```

Then open `http://localhost:3000`.

## Verify

```bash
npm test
npm run build:pages
npm run test:static
```

## Architecture

- **Build-time pipeline**: `scripts/generate-pages-data.mjs` fetches each source, validates, writes JSON to `public/data/`, and writes a `manifest.json` capturing per-source status. The orchestrator is `lib/generate-static-data.ts`; the fetchers in `lib/shiller.ts`, `lib/buffett.ts`, `lib/spx-source.ts` are reachable only from there.
- **No runtime API**: the deployed site is static HTML/CSS/JS plus the committed JSON. The browser fetches `/data/<source>.json` directly. There is no `/api/*` route in production.
- **GitHub Actions** (.github/workflows/deploy-pages.yml): scheduled runs regenerate, validate, build, run a smoke test, and auto-commit refreshed data back to `main` with `[skip ci]`.

## Data sources

| Source | URL |
|---|---|
| Shiller CAPE workbook | shillerdata.com / Yale |
| FRED daily S&P 500 | fred.stlouisfed.org |
| Nasdaq SPY OHLC | api.nasdaq.com |
| FRED equity market value | fred.stlouisfed.org |
| FRED U.S. GDP | fred.stlouisfed.org |
| FRED World GDP | fred.stlouisfed.org |
| World Bank world market cap | api.worldbank.org |
| Yahoo Finance ^GSPC | query1.finance.yahoo.com |

The full status is visible at `/data` on the deployed site.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README for unified static-export model"
```

---

### Task 13: Final verification and browser QA

**Files:**
- Modify: any files where verification surfaces a regression.

Full local run-through plus browser QA. No code changes expected unless something breaks.

- [ ] **Step 1: Full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Production build**

```bash
npm run build:pages
```

Expected: build exits 0; `out/` populated with all pages and data files.

- [ ] **Step 3: Smoke test**

```bash
npm run test:static
```

Expected: every check `PASS`s.

- [ ] **Step 4: Local serve of the static output**

```bash
npx serve out -l 4173
# In another shell, curl key routes
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/market-atlas/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/market-atlas/data/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/market-atlas/chart/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/market-atlas/buffett/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/market-atlas/spx-weekdays/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/market-atlas/data/manifest.json
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/market-atlas/data/shiller.json
```

Expected: each `200`.

Kill the serve process when done.

- [ ] **Step 5: Browser QA in an in-app browser**

Open each route at `http://localhost:4173/market-atlas/<path>/` and verify:
- `/market-atlas/` — Dashboard renders, CAPE value shows, side panel shows percentile/10Y EPS/10Y Treasury.
- `/market-atlas/chart/` — CAPE workbench + Forward PE comparison both render. Range buttons work.
- `/market-atlas/buffett/` — Three comparison modes (U.S./U.S., U.S./World, World/World) render.
- `/market-atlas/spx-weekdays/` — Range and method buttons fetch `/data/spx-weekdays/<range>-<method>.json` (verify in Network tab). No `/api/` requests.
- `/market-atlas/data/` — Source-status table renders with three cards, all `ok` badges. Build-metadata strip shows local build. Spx variants `<details>` expands to 18 download links.

In each page, verify:
- Active nav link shows the underline (`aria-current="page"` rule).
- "Data sources" link in nav goes to `/market-atlas/data/`.
- No console errors.

- [ ] **Step 5b: Force an error state and verify the link goes to `/data`**

```bash
# With the npx serve still running:
mv out/data/shiller.json /tmp/shiller.json.bak
# (Cannot easily reload — out/ is static. Instead force the error path
# locally: rename public/data/shiller.json before npm run dev.)
mv public/data/shiller.json /tmp/shiller.json.disk-bak
npm run dev -- -p 3001
```

Open `http://localhost:3001/` in the in-app browser. The error-state branch should render with "Check the data endpoint" or similar link. Verify the link `href` points to `/data` (or `/market-atlas/data` in production basePath), **not** `/api/shiller`.

Repeat by renaming `public/data/buffett.json` and visiting `/buffett`, then `spx-weekdays/*.json` and visiting `/spx-weekdays`.

Restore when done:

```bash
mv /tmp/shiller.json.disk-bak public/data/shiller.json
mv /tmp/shiller.json.bak out/data/shiller.json
# (and any others you renamed)
```

- [ ] **Step 6: Simulated source-failure smoke check**

Test the preserve-on-failure path locally:

```bash
# Move shiller.json out of the way so the next "fresh" fetch goes through
mv public/data/shiller.json /tmp/shiller.json.backup

# Run the generator in a way that simulates a fetch failure — easiest is to
# point at an unreachable URL via env override. Simpler: temporarily edit
# lib/shiller.ts to throw at the top of fetchShillerData, run, then revert.
# Or just confirm via the unit tests in tests/generate-static-data.test.ts
# that the path is covered (no manual repro needed).

# Restore
mv /tmp/shiller.json.backup public/data/shiller.json
```

Confirm the test `one fetcher rejects → that source stale, others ok, file untouched` in `tests/generate-static-data.test.ts` covers this path. No manual repro needed if the unit test passes.

- [ ] **Step 7: Verify the bootstrap commits look right in `git log`**

```bash
git log --oneline -15
```

Expected: roughly this sequence (commits from this PR's branch in reverse-chronological order, plus the Pre-Work commit at the bottom):

```
<sha>  Update README for unified static-export model
<sha>  Update workflow for unified static-export pipeline
<sha>  Add post-build static-export smoke test
<sha>  Add /data route surfacing manifest and downloads
<sha>  Update page nav and error-state links
<sha>  Demolish app/api, lib/market-data, SQLite cache layer
<sha>  Collapse data-loading abstractions to single static read path
<sha>  Generate initial public/data/manifest.json
<sha>  Add generate-static-data orchestrator with L3 validation
<sha>  Add Zod L3 schemas for manifest and per-source datasets
<sha>  Lift shared date formatters to lib/format.ts
<sha>  Track public/data/*.json as committed fallback
<sha>  Add realized one-year-ahead Forward PE comparison chart  ← Pre-Work
```

Note the new order — **Collapse** (Task 6) comes **before** **Demolish** (Task 7) so the build never breaks mid-PR.

- [ ] **Step 8: Final commit if anything was patched**

Only commit if verification surfaced a real bug:

```bash
git add <changed files>
git commit -m "Fix <specific issue surfaced during verification>"
```

If no fixes were needed, do not create an empty commit.

---

## Done

The sub-project (1) PR is now ready for review and merge. After merge:
- The next scheduled run on `main` will regenerate, validate, smoke-test, and auto-commit fresh data with `[skip ci]`.
- Subsequent sub-projects (2)–(6) build on the manifest, validation, and `/data` route introduced here.
