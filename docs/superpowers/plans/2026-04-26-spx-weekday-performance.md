# SPX Weekday Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/spx-weekdays` page backed by a local SQLite SPX OHLC cache, with weekday performance charts for open-to-close and previous-close-to-close methods.

**Architecture:** Add a small market-data layer around `node:sqlite`, ingest free Stooq `^SPX` daily CSV data into `data/market-atlas.sqlite`, compute weekday analytics in pure TypeScript, expose the computed dataset through `/api/spx-weekdays`, and render a Research Dashboard-style page with summary and cumulative charts. The database metadata tables are intentionally shared so CAPE and Buffett can migrate to the same cache pattern later.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Node 24 `node:sqlite`, CSS in `app/globals.css`.

---

## Source Spec

Implement the approved design in `docs/superpowers/specs/2026-04-26-spx-weekday-performance-design.md`.

## File Structure

- Create `lib/market-data/db.ts`: opens SQLite, initializes schema, provides testable database helpers.
- Create `lib/market-data/sources.ts`: registers source records and records refresh attempts.
- Create `lib/market-data/spx-repository.ts`: reads and upserts SPX daily OHLC rows.
- Create `lib/spx-source.ts`: fetches/parses free Stooq SPX CSV.
- Create `lib/spx-weekdays.ts`: range filtering, return calculations, weekday grouping, and chart payload building.
- Create `lib/spx-weekday-service.ts`: initializes the database, refreshes SPX data, and returns the complete API/page payload.
- Create `app/api/spx-weekdays/route.ts`: ensures data exists, refreshes stale cache, returns analytics JSON.
- Create `app/spx-weekdays/page.tsx`: server page that loads initial SPX weekday data through the shared service.
- Create `app/spx-weekdays/spx-weekday-dashboard.tsx`: client dashboard, controls, charts, stats, source note.
- Modify `app/page.tsx`, `app/dashboard.tsx`, `app/chart/page.tsx`, `app/chart/detailed-chart.tsx`, `app/buffett/page.tsx`, `app/buffett/buffett-dashboard.tsx`: add navigation to SPX weekdays where each page currently lists primary routes.
- Modify `app/globals.css`: styles for the new route and charts.
- Modify `.gitignore`: ignore the generated SQLite database path if not already ignored.
- Create `tests/spx-source.test.ts`: Stooq CSV parsing tests.
- Create `tests/spx-weekdays.test.ts`: analytics tests.
- Create `tests/market-data.test.ts`: schema/upsert/cache metadata tests.

## Task 1: SPX Source Parser

**Files:**
- Create: `lib/spx-source.ts`
- Test: `tests/spx-source.test.ts`

- [ ] **Step 1: Write the failing parser test**

Create `tests/spx-source.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseStooqDailyCsv, STOOQ_SPX_DAILY_URL } from "../lib/spx-source";

describe("parseStooqDailyCsv", () => {
  test("parses SPX daily OHLC rows from Stooq CSV and filters before 1993", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "1992-12-31,435.71,439.77,435.71,435.71,0",
      "1993-01-04,435.70,437.32,434.48,435.38,0",
      "1993-01-05,435.38,435.40,433.55,434.34,0"
    ].join("\\n");

    const rows = parseStooqDailyCsv(csv);

    expect(STOOQ_SPX_DAILY_URL).toContain("%5Espx");
    expect(rows).toEqual([
      {
        date: "1993-01-04",
        open: 435.7,
        high: 437.32,
        low: 434.48,
        close: 435.38,
        volume: 0
      },
      {
        date: "1993-01-05",
        open: 435.38,
        high: 435.4,
        low: 433.55,
        close: 434.34,
        volume: 0
      }
    ]);
  });

  test("skips malformed and non-finite rows", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "1993-01-04,435.70,437.32,434.48,435.38,0",
      "not-a-date,1,2,3,4,5",
      "1993-01-06,436.00,437.00,435.00,N/D,0"
    ].join("\\n");

    expect(parseStooqDailyCsv(csv)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test tests/spx-source.test.ts
```

Expected: fail because `../lib/spx-source` does not exist.

- [ ] **Step 3: Implement the parser**

Create `lib/spx-source.ts`:

```ts
export type SpxDailyPrice = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export const STOOQ_SPX_DAILY_URL = "https://stooq.com/q/d/l/?s=%5Espx&i=d";
export const SPX_START_DATE = "1993-01-01";

export async function fetchStooqSpxDailyCsv(): Promise<string> {
  const response = await fetch(STOOQ_SPX_DAILY_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Stooq SPX source returned ${response.status}`);
  }

  return response.text();
}

export function parseStooqDailyCsv(csv: string): SpxDailyPrice[] {
  const [headerLine, ...lines] = csv.trim().split(/\\r?\\n/);

  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split(",").map((header) => header.trim().toLowerCase());
  const dateIndex = headers.indexOf("date");
  const openIndex = headers.indexOf("open");
  const highIndex = headers.indexOf("high");
  const lowIndex = headers.indexOf("low");
  const closeIndex = headers.indexOf("close");
  const volumeIndex = headers.indexOf("volume");

  if ([dateIndex, openIndex, highIndex, lowIndex, closeIndex].some((index) => index === -1)) {
    return [];
  }

  return lines
    .map((line) => {
      const cells = line.split(",").map((cell) => cell.trim());
      const date = cells[dateIndex];
      const open = toFiniteNumber(cells[openIndex]);
      const high = toFiniteNumber(cells[highIndex]);
      const low = toFiniteNumber(cells[lowIndex]);
      const close = toFiniteNumber(cells[closeIndex]);
      const volume = volumeIndex === -1 ? null : toOptionalFiniteNumber(cells[volumeIndex]);

      if (
        !/^\\d{4}-\\d{2}-\\d{2}$/.test(date) ||
        date < SPX_START_DATE ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }

      return { date, open, high, low, close, volume };
    })
    .filter((row): row is SpxDailyPrice => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function toFiniteNumber(value: string | undefined): number | null {
  if (!value || value.toUpperCase() === "N/D") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalFiniteNumber(value: string | undefined): number | null {
  if (!value || value.toUpperCase() === "N/D") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test tests/spx-source.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/spx-source.ts tests/spx-source.test.ts
git commit -m "Add SPX source parser"
```

## Task 2: SQLite Market Data Layer

**Files:**
- Create: `lib/market-data/db.ts`
- Create: `lib/market-data/sources.ts`
- Create: `lib/market-data/spx-repository.ts`
- Modify: `.gitignore`
- Test: `tests/market-data.test.ts`

- [ ] **Step 1: Write failing database tests**

Create `tests/market-data.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createMarketDataDb, initializeMarketDataSchema } from "../lib/market-data/db";
import { recordRefreshRun, upsertDataSource } from "../lib/market-data/sources";
import {
  getSpxCacheSummary,
  readSpxDailyPrices,
  upsertSpxDailyPrices
} from "../lib/market-data/spx-repository";

const tempDirs: string[] = [];

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "market-atlas-"));
  tempDirs.push(dir);
  return join(dir, "test.sqlite");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { force: true, recursive: true });
  }
});

describe("market data database", () => {
  test("initializes shared source metadata and SPX tables", () => {
    const db = createMarketDataDb(tempDbPath());

    initializeMarketDataSchema(db);
    upsertDataSource(db, {
      key: "stooq-spx-daily",
      displayName: "Stooq SPX daily",
      provider: "Stooq",
      sourceUrl: "https://stooq.com/q/d/l/?s=%5Espx&i=d"
    });
    recordRefreshRun(db, {
      sourceKey: "stooq-spx-daily",
      status: "success",
      rowsFetched: 2,
      rowsChanged: 2,
      errorMessage: null
    });

    const sources = db.prepare("select source_key, display_name from data_sources").all();
    const runs = db.prepare("select source_key, status, rows_fetched from refresh_runs").all();

    expect(sources).toEqual([
      { source_key: "stooq-spx-daily", display_name: "Stooq SPX daily" }
    ]);
    expect(runs).toMatchObject([
      { source_key: "stooq-spx-daily", status: "success", rows_fetched: 2 }
    ]);
  });

  test("upserts and reads SPX daily prices in date order", () => {
    const db = createMarketDataDb(tempDbPath());
    initializeMarketDataSchema(db);

    upsertSpxDailyPrices(db, [
      { date: "1993-01-05", open: 435.38, high: 435.4, low: 433.55, close: 434.34, volume: 0 },
      { date: "1993-01-04", open: 435.7, high: 437.32, low: 434.48, close: 435.38, volume: 0 }
    ], "stooq-spx-daily");

    upsertSpxDailyPrices(db, [
      { date: "1993-01-05", open: 436, high: 437, low: 435, close: 436.5, volume: 10 }
    ], "stooq-spx-daily");

    expect(readSpxDailyPrices(db)).toEqual([
      { date: "1993-01-04", open: 435.7, high: 437.32, low: 434.48, close: 435.38, volume: 0 },
      { date: "1993-01-05", open: 436, high: 437, low: 435, close: 436.5, volume: 10 }
    ]);
    expect(getSpxCacheSummary(db)).toMatchObject({
      rowCount: 2,
      firstDate: "1993-01-04",
      latestDate: "1993-01-05"
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test tests/market-data.test.ts
```

Expected: fail because market-data modules do not exist.

- [ ] **Step 3: Implement database helpers**

Create `lib/market-data/db.ts`:

```ts
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type MarketDataDb = DatabaseSync;

export const DEFAULT_MARKET_DATA_DB_PATH = join(
  process.cwd(),
  "data",
  "market-atlas.sqlite"
);

export function createMarketDataDb(dbPath = DEFAULT_MARKET_DATA_DB_PATH): MarketDataDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  return new DatabaseSync(dbPath);
}

export function initializeMarketDataSchema(db: MarketDataDb) {
  db.exec(`
    create table if not exists data_sources (
      source_key text primary key,
      display_name text not null,
      source_url text not null,
      provider text not null,
      enabled integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists refresh_runs (
      id integer primary key autoincrement,
      source_key text not null,
      started_at text not null,
      finished_at text not null,
      status text not null,
      rows_fetched integer not null default 0,
      rows_changed integer not null default 0,
      error_message text,
      foreign key (source_key) references data_sources(source_key)
    );

    create table if not exists spx_daily_prices (
      date text primary key,
      open real not null,
      high real not null,
      low real not null,
      close real not null,
      volume real,
      source_key text not null,
      fetched_at text not null,
      foreign key (source_key) references data_sources(source_key)
    );
  `);
}
```

Create `lib/market-data/sources.ts`:

```ts
import type { MarketDataDb } from "./db";

export type DataSourceInput = {
  key: string;
  displayName: string;
  sourceUrl: string;
  provider: string;
};

export type RefreshRunInput = {
  sourceKey: string;
  status: "success" | "failure";
  rowsFetched: number;
  rowsChanged: number;
  errorMessage: string | null;
};

export function upsertDataSource(db: MarketDataDb, source: DataSourceInput) {
  const now = new Date().toISOString();
  db.prepare(`
    insert into data_sources (source_key, display_name, source_url, provider, enabled, created_at, updated_at)
    values (?, ?, ?, ?, 1, ?, ?)
    on conflict(source_key) do update set
      display_name = excluded.display_name,
      source_url = excluded.source_url,
      provider = excluded.provider,
      enabled = 1,
      updated_at = excluded.updated_at
  `).run(source.key, source.displayName, source.sourceUrl, source.provider, now, now);
}

export function recordRefreshRun(db: MarketDataDb, run: RefreshRunInput) {
  const now = new Date().toISOString();
  db.prepare(`
    insert into refresh_runs
      (source_key, started_at, finished_at, status, rows_fetched, rows_changed, error_message)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.sourceKey,
    now,
    now,
    run.status,
    run.rowsFetched,
    run.rowsChanged,
    run.errorMessage
  );
}
```

Create `lib/market-data/spx-repository.ts`:

```ts
import type { MarketDataDb } from "./db";
import type { SpxDailyPrice } from "../spx-source";

export type SpxCacheSummary = {
  rowCount: number;
  firstDate: string | null;
  latestDate: string | null;
};

export function upsertSpxDailyPrices(
  db: MarketDataDb,
  rows: SpxDailyPrice[],
  sourceKey: string
): number {
  const fetchedAt = new Date().toISOString();
  const statement = db.prepare(`
    insert into spx_daily_prices (date, open, high, low, close, volume, source_key, fetched_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(date) do update set
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume,
      source_key = excluded.source_key,
      fetched_at = excluded.fetched_at
  `);

  const transaction = db.transaction((prices: SpxDailyPrice[]) => {
    for (const row of prices) {
      statement.run(
        row.date,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
        sourceKey,
        fetchedAt
      );
    }
  });

  transaction(rows);
  return rows.length;
}

export function readSpxDailyPrices(db: MarketDataDb): SpxDailyPrice[] {
  return db.prepare(`
    select date, open, high, low, close, volume
    from spx_daily_prices
    order by date asc
  `).all() as SpxDailyPrice[];
}

export function getSpxCacheSummary(db: MarketDataDb): SpxCacheSummary {
  const row = db.prepare(`
    select
      count(*) as rowCount,
      min(date) as firstDate,
      max(date) as latestDate
    from spx_daily_prices
  `).get() as { rowCount: number; firstDate: string | null; latestDate: string | null };

  return row;
}
```

- [ ] **Step 4: Update gitignore for generated DB**

Modify `.gitignore`:

```text
data/*.sqlite
data/*.sqlite-*
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test tests/market-data.test.ts
```

Expected: pass. If Node prints an experimental `node:sqlite` warning, keep going only if the test process exits 0.

- [ ] **Step 6: Commit**

```bash
git add .gitignore lib/market-data tests/market-data.test.ts
git commit -m "Add SQLite market data cache"
```

## Task 3: Weekday Analytics

**Files:**
- Create: `lib/spx-weekdays.ts`
- Test: `tests/spx-weekdays.test.ts`

- [ ] **Step 1: Write failing analytics tests**

Create `tests/spx-weekdays.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  buildSpxWeekdayDataset,
  filterSpxRange,
  type SpxReturnMethod
} from "../lib/spx-weekdays";
import type { SpxDailyPrice } from "../lib/spx-source";

const sampleRows: SpxDailyPrice[] = [
  { date: "2024-01-01", open: 100, high: 101, low: 99, close: 101, volume: 0 },
  { date: "2024-01-02", open: 102, high: 104, low: 101, close: 104, volume: 0 },
  { date: "2024-01-03", open: 104, high: 105, low: 100, close: 101, volume: 0 },
  { date: "2024-01-05", open: 101, high: 108, low: 100, close: 106, volume: 0 },
  { date: "2024-01-08", open: 106, high: 108, low: 105, close: 107, volume: 0 },
  { date: "2024-01-09", open: 107, high: 110, low: 106, close: 109, volume: 0 }
];

describe("filterSpxRange", () => {
  test("filters trailing one month by trading dates", () => {
    const rows = [
      { date: "2023-12-01", open: 1, high: 1, low: 1, close: 1, volume: null },
      { date: "2024-01-01", open: 2, high: 2, low: 2, close: 2, volume: null }
    ];

    expect(filterSpxRange(rows, "1m").map((row) => row.date)).toEqual(["2024-01-01"]);
  });
});

describe("buildSpxWeekdayDataset", () => {
  test.each<SpxReturnMethod>(["openClose", "closeClose"])(
    "returns Monday through Friday stats for %s",
    (method) => {
      const dataset = buildSpxWeekdayDataset(sampleRows, {
        range: "all",
        method
      });

      expect(dataset.weekdayStats.map((stat) => stat.weekday)).toEqual([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ]);
      expect(dataset.summaryPoints).toHaveLength(5);
      expect(dataset.cumulativeSeries).toHaveLength(5);
    }
  );

  test("computes open-to-close returns by current trading weekday", () => {
    const dataset = buildSpxWeekdayDataset(sampleRows, {
      range: "all",
      method: "openClose"
    });

    const monday = dataset.weekdayStats.find((stat) => stat.weekday === "Monday");
    const friday = dataset.weekdayStats.find((stat) => stat.weekday === "Friday");

    expect(monday).toMatchObject({
      sampleCount: 2,
      winRate: 100
    });
    expect(monday?.averageReturn).toBeCloseTo(0.97, 2);
    expect(friday?.totalReturn).toBeCloseTo(4.95, 2);
  });

  test("computes close-to-close returns from previous available trading close", () => {
    const dataset = buildSpxWeekdayDataset(sampleRows, {
      range: "all",
      method: "closeClose"
    });

    const tuesday = dataset.weekdayStats.find((stat) => stat.weekday === "Tuesday");
    const thursday = dataset.weekdayStats.find((stat) => stat.weekday === "Thursday");

    expect(tuesday?.sampleCount).toBe(2);
    expect(tuesday?.averageReturn).toBeCloseTo(2.45, 2);
    expect(thursday?.sampleCount).toBe(0);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test tests/spx-weekdays.test.ts
```

Expected: fail because `../lib/spx-weekdays` does not exist.

- [ ] **Step 3: Implement analytics**

Create `lib/spx-weekdays.ts` with exported types and functions:

```ts
import type { SpxDailyPrice } from "./spx-source";

export type SpxRange = "1m" | "3m" | "6m" | "1y" | "2y" | "5y" | "10y" | "all";
export type SpxReturnMethod = "openClose" | "closeClose";
export type WeekdayName = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";

export type SpxWeekdayReturn = {
  date: string;
  weekday: WeekdayName;
  returnPct: number;
  cumulativeReturn: number;
};

export type SpxWeekdayStat = {
  weekday: WeekdayName;
  averageReturn: number;
  totalReturn: number;
  winRate: number;
  sampleCount: number;
  bestReturn: number | null;
  bestDate: string | null;
  worstReturn: number | null;
  worstDate: string | null;
};

export type SpxWeekdayDataset = {
  range: SpxRange;
  method: SpxReturnMethod;
  startDate: string | null;
  endDate: string | null;
  summaryPoints: SpxWeekdayStat[];
  weekdayStats: SpxWeekdayStat[];
  cumulativeSeries: Array<{
    weekday: WeekdayName;
    points: SpxWeekdayReturn[];
  }>;
};

const WEEKDAYS: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export function filterSpxRange(rows: SpxDailyPrice[], range: SpxRange): SpxDailyPrice[] {
  const sortedRows = [...rows].sort((left, right) => left.date.localeCompare(right.date));

  if (range === "all" || sortedRows.length === 0) {
    return sortedRows;
  }

  const latest = sortedRows[sortedRows.length - 1].date;
  const cutoff = shiftUtcDate(latest, range);
  return sortedRows.filter((row) => row.date >= cutoff);
}

export function buildSpxWeekdayDataset(
  rows: SpxDailyPrice[],
  options: { range: SpxRange; method: SpxReturnMethod }
): SpxWeekdayDataset {
  const visibleRows = filterSpxRange(rows, options.range);
  const returns = buildReturns(visibleRows, options.method);
  const grouped = new Map<WeekdayName, SpxWeekdayReturn[]>(
    WEEKDAYS.map((weekday) => [weekday, []])
  );

  for (const item of returns) {
    grouped.get(item.weekday)?.push(item);
  }

  const cumulativeSeries = WEEKDAYS.map((weekday) => {
    let cumulative = 1;
    const points = (grouped.get(weekday) ?? []).map((point) => {
      cumulative *= 1 + point.returnPct / 100;
      return {
        ...point,
        cumulativeReturn: roundNumber((cumulative - 1) * 100)
      };
    });

    return { weekday, points };
  });

  const weekdayStats = WEEKDAYS.map((weekday) =>
    summarizeWeekday(weekday, cumulativeSeries.find((series) => series.weekday === weekday)?.points ?? [])
  );

  return {
    range: options.range,
    method: options.method,
    startDate: visibleRows[0]?.date ?? null,
    endDate: visibleRows[visibleRows.length - 1]?.date ?? null,
    summaryPoints: weekdayStats,
    weekdayStats,
    cumulativeSeries
  };
}

function buildReturns(rows: SpxDailyPrice[], method: SpxReturnMethod): SpxWeekdayReturn[] {
  return rows.reduce<SpxWeekdayReturn[]>((items, row, index) => {
    const weekday = getWeekdayName(row.date);

    if (!weekday) {
      return items;
    }

    const base = method === "openClose" ? row.open : rows[index - 1]?.close;

    if (!base || base <= 0) {
      return items;
    }

    items.push({
      date: row.date,
      weekday,
      returnPct: roundNumber(((row.close - base) / base) * 100),
      cumulativeReturn: 0
    });

    return items;
  }, []);
}

function summarizeWeekday(weekday: WeekdayName, points: SpxWeekdayReturn[]): SpxWeekdayStat {
  if (points.length === 0) {
    return {
      weekday,
      averageReturn: 0,
      totalReturn: 0,
      winRate: 0,
      sampleCount: 0,
      bestReturn: null,
      bestDate: null,
      worstReturn: null,
      worstDate: null
    };
  }

  const best = [...points].sort((left, right) => right.returnPct - left.returnPct)[0];
  const worst = [...points].sort((left, right) => left.returnPct - right.returnPct)[0];

  return {
    weekday,
    averageReturn: roundNumber(points.reduce((sum, point) => sum + point.returnPct, 0) / points.length),
    totalReturn: points[points.length - 1].cumulativeReturn,
    winRate: roundNumber((points.filter((point) => point.returnPct > 0).length / points.length) * 100),
    sampleCount: points.length,
    bestReturn: best.returnPct,
    bestDate: best.date,
    worstReturn: worst.returnPct,
    worstDate: worst.date
  };
}

function getWeekdayName(date: string): WeekdayName | null {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5 ? WEEKDAYS[day - 1] : null;
}

function shiftUtcDate(date: string, range: Exclude<SpxRange, "all">): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const monthsByRange: Record<Exclude<SpxRange, "all">, number> = {
    "1m": 1,
    "3m": 3,
    "6m": 6,
    "1y": 12,
    "2y": 24,
    "5y": 60,
    "10y": 120
  };
  parsed.setUTCMonth(parsed.getUTCMonth() - monthsByRange[range]);
  return parsed.toISOString().slice(0, 10);
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test tests/spx-weekdays.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/spx-weekdays.ts tests/spx-weekdays.test.ts
git commit -m "Add SPX weekday analytics"
```

## Task 4: SPX Weekday API

**Files:**
- Create: `app/api/spx-weekdays/route.ts`
- Create: `lib/spx-weekday-service.ts`
- Modify: `lib/market-data/sources.ts` or `lib/market-data/spx-repository.ts` only if Task 4 needs tiny helper functions.
- Test: add API-shaping coverage to `tests/spx-weekdays.test.ts` or create `tests/spx-api.test.ts`.

- [ ] **Step 1: Write failing service/API-shape test**

Add to `tests/spx-weekdays.test.ts`:

```ts
import { normalizeSpxWeekdayQuery } from "../lib/spx-weekdays";

test("normalizes invalid SPX weekday query params to defaults", () => {
  expect(normalizeSpxWeekdayQuery({ range: "bad", method: "bad" })).toEqual({
    range: "1y",
    method: "openClose"
  });
  expect(normalizeSpxWeekdayQuery({ range: "10y", method: "closeClose" })).toEqual({
    range: "10y",
    method: "closeClose"
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test tests/spx-weekdays.test.ts
```

Expected: fail because `normalizeSpxWeekdayQuery` is not exported.

- [ ] **Step 3: Implement query normalization**

Add to `lib/spx-weekdays.ts`:

```ts
const RANGE_VALUES = new Set<SpxRange>(["1m", "3m", "6m", "1y", "2y", "5y", "10y", "all"]);
const METHOD_VALUES = new Set<SpxReturnMethod>(["openClose", "closeClose"]);

export function normalizeSpxWeekdayQuery(input: {
  range?: string | null;
  method?: string | null;
}): { range: SpxRange; method: SpxReturnMethod } {
  return {
    range: RANGE_VALUES.has(input.range as SpxRange) ? (input.range as SpxRange) : "1y",
    method: METHOD_VALUES.has(input.method as SpxReturnMethod)
      ? (input.method as SpxReturnMethod)
      : "openClose"
  };
}
```

- [ ] **Step 4: Verify query test GREEN**

Run:

```bash
npm test tests/spx-weekdays.test.ts
```

Expected: pass.

- [ ] **Step 5: Implement shared service**

Create `lib/spx-weekday-service.ts`:

```ts
import {
  createMarketDataDb,
  initializeMarketDataSchema
} from "./market-data/db";
import {
  recordRefreshRun,
  upsertDataSource
} from "./market-data/sources";
import {
  getSpxCacheSummary,
  readSpxDailyPrices,
  upsertSpxDailyPrices
} from "./market-data/spx-repository";
import {
  fetchStooqSpxDailyCsv,
  parseStooqDailyCsv,
  STOOQ_SPX_DAILY_URL
} from "./spx-source";
import {
  buildSpxWeekdayDataset,
  type SpxRange,
  type SpxReturnMethod
} from "./spx-weekdays";

const SPX_SOURCE_KEY = "stooq-spx-daily";

export type SpxWeekdayPayload = ReturnType<typeof buildSpxWeekdayDataset> & {
  source: {
    key: string;
    name: string;
    url: string;
  };
  database: {
    latestDate: string | null;
    firstDate: string | null;
    rowCount: number;
  };
  warning: string | null;
};

export async function loadSpxWeekdayData(query: {
  range: SpxRange;
  method: SpxReturnMethod;
}): Promise<SpxWeekdayPayload> {
  const db = createMarketDataDb();
  initializeMarketDataSchema(db);
  upsertDataSource(db, {
    key: SPX_SOURCE_KEY,
    displayName: "Stooq SPX daily",
    provider: "Stooq",
    sourceUrl: STOOQ_SPX_DAILY_URL
  });

  let warning: string | null = null;

  try {
    const csv = await fetchStooqSpxDailyCsv();
    const rows = parseStooqDailyCsv(csv);

    if (rows.length === 0) {
      throw new Error("Stooq SPX CSV did not contain usable rows");
    }

    const rowsChanged = upsertSpxDailyPrices(db, rows, SPX_SOURCE_KEY);
    recordRefreshRun(db, {
      sourceKey: SPX_SOURCE_KEY,
      status: "success",
      rowsFetched: rows.length,
      rowsChanged,
      errorMessage: null
    });
  } catch (error) {
    warning = error instanceof Error ? error.message : "Unable to refresh SPX data";
    recordRefreshRun(db, {
      sourceKey: SPX_SOURCE_KEY,
      status: "failure",
      rowsFetched: 0,
      rowsChanged: 0,
      errorMessage: warning
    });
  }

  const prices = readSpxDailyPrices(db);
  const cache = getSpxCacheSummary(db);

  if (prices.length === 0) {
    throw new Error(warning ?? "No SPX data is available in the local cache");
  }

  return {
    ...buildSpxWeekdayDataset(prices, query),
    source: {
      key: SPX_SOURCE_KEY,
      name: "Stooq SPX daily",
      url: STOOQ_SPX_DAILY_URL
    },
    database: {
      latestDate: cache.latestDate,
      firstDate: cache.firstDate,
      rowCount: cache.rowCount
    },
    warning
  };
}
```

- [ ] **Step 6: Implement API route**

Create `app/api/spx-weekdays/route.ts`:

```ts
import { NextResponse } from "next/server";
import { loadSpxWeekdayData } from "../../../lib/spx-weekday-service";
import { normalizeSpxWeekdayQuery } from "../../../lib/spx-weekdays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = normalizeSpxWeekdayQuery({
    range: searchParams.get("range"),
    method: searchParams.get("method")
  });

  try {
    return NextResponse.json(await loadSpxWeekdayData(query));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load SPX weekday performance data"
      },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 7: Verify API compiles**

Run:

```bash
npm run build
```

Expected: build exits 0 and route list includes `/api/spx-weekdays`.

- [ ] **Step 8: Commit**

```bash
git add app/api/spx-weekdays/route.ts lib/spx-weekday-service.ts lib/spx-weekdays.ts tests/spx-weekdays.test.ts
git commit -m "Add SPX weekday API"
```

## Task 5: SPX Weekday Page And Charts

**Files:**
- Create: `app/spx-weekdays/page.tsx`
- Create: `app/spx-weekdays/spx-weekday-dashboard.tsx`
- Modify: `app/globals.css`
- Modify navigation files listed in File Structure.

- [ ] **Step 1: Add the server page**

Create `app/spx-weekdays/page.tsx`:

```tsx
import { SpxWeekdayDashboard } from "./spx-weekday-dashboard";

export const dynamic = "force-dynamic";

async function fetchInitialDataset() {
  const { loadSpxWeekdayData } = await import("../../lib/spx-weekday-service");
  return loadSpxWeekdayData({ range: "1y", method: "openClose" });
}

export default async function SpxWeekdaysPage() {
  const initialDataset = await fetchInitialDataset();

  return <SpxWeekdayDashboard initialDataset={initialDataset} />;
}
```

- [ ] **Step 2: Create the client dashboard**

Create `app/spx-weekdays/spx-weekday-dashboard.tsx` that includes these concrete elements:

- `use client`
- typed props matching the API payload
- range segmented controls
- method segmented controls
- fetch-on-control-change behavior against `/api/spx-weekdays`
- summary bar chart SVG
- cumulative line chart SVG
- stats grid
- source/freshness note

Use the existing `BuffettDashboard` and `DetailedChart` component style as the local pattern. Keep charts as inline SVG helpers in this component for the first pass.

- [ ] **Step 3: Add styles**

Add focused classes to `app/globals.css`:

- `.weekdayChartGrid`
- `.weekdaySummaryChart`
- `.weekdayCumulativeChart`
- `.weekdayLegend`
- `.weekdayReadout`
- `.weekdayStatGrid`

Reuse existing `shell`, `chartShell`, `topbar`, `workbenchIntro`, `panel`, `segmented`, `chartControls`, and `chartMetaGrid` where possible.

- [ ] **Step 4: Add navigation**

Add `SPX weekdays` links beside the existing Dashboard/CAPE/Buffett/Data Sources nav links in:

- `app/page.tsx`
- `app/dashboard.tsx`
- `app/chart/page.tsx`
- `app/chart/detailed-chart.tsx`
- `app/buffett/page.tsx`
- `app/buffett/buffett-dashboard.tsx`

- [ ] **Step 5: Verify page build**

Run:

```bash
npm run build
```

Expected: build exits 0 and route list includes `/spx-weekdays`.

- [ ] **Step 6: Commit**

```bash
git add app/spx-weekdays app/globals.css app/page.tsx app/dashboard.tsx app/chart/page.tsx app/chart/detailed-chart.tsx app/buffett/page.tsx app/buffett/buffett-dashboard.tsx
git commit -m "Add SPX weekday performance page"
```

## Task 6: Final Verification And Browser QA

**Files:**
- Modify only files required by defects found in verification, and record the exact reason in the commit message.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: all test files pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: build exits 0 and includes `/spx-weekdays` and `/api/spx-weekdays`.

- [ ] **Step 3: Start or reuse dev server**

Run:

```bash
npm run dev -- -p 3001
```

If port 3001 is already in use by the existing app, use another available port and verify the URL in the browser.

- [ ] **Step 4: Browser QA**

Use the in-app browser to verify:

- `/spx-weekdays` renders.
- Range buttons update the page without console errors.
- Method toggle switches between Open to close and Close to close.
- Summary chart and cumulative chart are both visible.
- Source/freshness note shows Stooq and local database metadata.
- Navigation to Dashboard, CAPE chart, and Buffett page still works.

- [ ] **Step 5: Final review**

Review the diff against the design spec:

- SPX uses SQLite-backed cached data.
- Free public source is Stooq.
- Both return methods are implemented.
- Both chart types are implemented.
- CAPE/Buffett are not rewritten now.
- Shared metadata exists for future CAPE/Buffett migration.

- [ ] **Step 6: Commit verification fixes**

If fixes were needed:

```bash
git add <changed files>
git commit -m "Polish SPX weekday verification issues"
```

If no fixes were needed, do not create an empty commit.
