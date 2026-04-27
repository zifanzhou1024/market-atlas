import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createMarketDataDb,
  initializeMarketDataSchema,
  type MarketDataDb
} from "../lib/market-data/db";
import { upsertDataSource } from "../lib/market-data/sources";
import { upsertSpxDailyPrices } from "../lib/market-data/spx-repository";
import { loadSpxWeekdayData } from "../lib/spx-weekday-service";
import { YAHOO_SPX_CHART_BASE_URL, type SpxDailyPrice } from "../lib/spx-source";

const { activeDbPath, yahooFetchMock } = vi.hoisted(() => ({
  activeDbPath: { current: "" },
  yahooFetchMock: vi.fn<() => Promise<unknown>>()
}));

vi.mock("../lib/market-data/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/market-data/db")>();

  return {
    ...actual,
    createMarketDataDb: vi.fn((dbPath?: string) =>
      actual.createMarketDataDb(dbPath ?? activeDbPath.current)
    )
  };
});

vi.mock("../lib/spx-source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/spx-source")>();

  return {
    ...actual,
    fetchYahooSpxChartJson: yahooFetchMock
  };
});

const SPX_SOURCE_KEY = "yahoo-spx-chart";
const SOURCE_INPUT = {
  key: SPX_SOURCE_KEY,
  displayName: "Yahoo Finance SPX chart",
  provider: "Yahoo Finance",
  sourceUrl: YAHOO_SPX_CHART_BASE_URL
};
const NOW = new Date("2026-04-27T15:00:00.000Z");
const ONE_HOUR_AGO = "2026-04-27T14:00:00.000Z";
const STALE_SUCCESS_AT = "2026-04-27T08:00:00.000Z";
const CACHED_FETCHED_AT = "2026-04-27T07:55:00.000Z";
const QUERY = { range: "1y" as const, method: "openClose" as const };

const cachedRows: SpxDailyPrice[] = [
  { date: "2024-01-01", open: 100, high: 102, low: 99, close: 101, volume: 0 },
  { date: "2024-01-02", open: 101, high: 104, low: 100, close: 103, volume: 0 }
];

const yahooPayload = {
  chart: {
    result: [
      {
        timestamp: [1704067200, 1704153600],
        indicators: {
          quote: [
            {
              open: [100, 101],
              high: [102, 104],
              low: [99, 100],
              close: [101, 103],
              volume: [0, 0]
            }
          ]
        }
      }
    ]
  }
};

const tempDirs: string[] = [];
const dbHandles: MarketDataDb[] = [];

beforeEach(() => {
  yahooFetchMock.mockReset();
  activeDbPath.current = tempDbPath();
});

afterEach(() => {
  while (dbHandles.length > 0) {
    dbHandles.pop()?.close();
  }

  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { force: true, recursive: true });
  }
});

describe("loadSpxWeekdayData cache freshness", () => {
  test("does not call the fetcher when the cached SPX rows are fresh", async () => {
    seedCache({
      rows: cachedRows,
      successfulRefreshAt: ONE_HOUR_AGO,
      fetchedAt: ONE_HOUR_AGO
    });

    const payload = await loadSpxWeekdayData(QUERY, {
      dbPath: activeDbPath.current,
      fetcher: yahooFetchMock,
      now: () => NOW
    });

    expect(yahooFetchMock).not.toHaveBeenCalled();
    expect(payload.warning).toBeNull();
    expect(payload.database).toMatchObject({
      rowCount: 2,
      firstDate: "2024-01-01",
      latestDate: "2024-01-02",
      latestFetchedAt: ONE_HOUR_AGO,
      lastSuccessfulRefreshAt: ONE_HOUR_AGO,
      lastAttemptedRefreshAt: ONE_HOUR_AGO
    });
  });

  test("refreshes stale or missing cache and returns source and database freshness metadata", async () => {
    yahooFetchMock.mockResolvedValue(yahooPayload);

    const payload = await loadSpxWeekdayData(QUERY, {
      dbPath: activeDbPath.current,
      fetcher: yahooFetchMock,
      now: () => NOW
    });

    expect(yahooFetchMock).toHaveBeenCalledTimes(1);
    expect(payload.source).toMatchObject({
      key: "yahoo-spx-chart",
      displayName: "Yahoo Finance SPX chart",
      provider: "Yahoo Finance",
      url: YAHOO_SPX_CHART_BASE_URL
    });
    expect(payload.database).toMatchObject({
      rowCount: 2,
      firstDate: "2024-01-01",
      latestDate: "2024-01-02",
      latestFetchedAt: NOW.toISOString(),
      lastSuccessfulRefreshAt: NOW.toISOString(),
      lastAttemptedRefreshAt: NOW.toISOString()
    });
    expect(payload.warning).toBeNull();
  });

  test("returns cached rows with warning and refresh timestamps when refresh fails", async () => {
    seedCache({
      rows: cachedRows,
      successfulRefreshAt: STALE_SUCCESS_AT,
      fetchedAt: CACHED_FETCHED_AT
    });
    yahooFetchMock.mockRejectedValue(new Error("Yahoo unavailable"));

    const payload = await loadSpxWeekdayData(QUERY, {
      dbPath: activeDbPath.current,
      fetcher: yahooFetchMock,
      now: () => NOW
    });

    expect(yahooFetchMock).toHaveBeenCalledTimes(1);
    expect(payload.warning).toBe("Yahoo unavailable");
    expect(payload.database).toMatchObject({
      rowCount: 2,
      firstDate: "2024-01-01",
      latestDate: "2024-01-02",
      latestFetchedAt: CACHED_FETCHED_AT,
      lastSuccessfulRefreshAt: STALE_SUCCESS_AT,
      lastAttemptedRefreshAt: NOW.toISOString()
    });
  });

  test("does not immediately retry a failed refresh when cached rows exist", async () => {
    seedCache({
      rows: cachedRows,
      successfulRefreshAt: STALE_SUCCESS_AT,
      fetchedAt: CACHED_FETCHED_AT
    });
    yahooFetchMock.mockRejectedValueOnce(new Error("Yahoo unavailable"));

    const firstPayload = await loadSpxWeekdayData(QUERY, {
      dbPath: activeDbPath.current,
      fetcher: yahooFetchMock,
      now: () => NOW
    });
    const secondPayload = await loadSpxWeekdayData(QUERY, {
      dbPath: activeDbPath.current,
      fetcher: yahooFetchMock,
      now: () => new Date("2026-04-27T15:05:00.000Z")
    });

    expect(yahooFetchMock).toHaveBeenCalledTimes(1);
    expect(firstPayload.warning).toBe("Yahoo unavailable");
    expect(secondPayload.warning).toBe("Yahoo unavailable");
    expect(secondPayload.database).toMatchObject({
      rowCount: 2,
      firstDate: "2024-01-01",
      latestDate: "2024-01-02",
      latestFetchedAt: CACHED_FETCHED_AT,
      lastSuccessfulRefreshAt: STALE_SUCCESS_AT,
      lastAttemptedRefreshAt: NOW.toISOString()
    });
  });

  test("throws when refresh fails and no cached rows exist", async () => {
    yahooFetchMock.mockRejectedValue(new Error("Yahoo unavailable"));

    await expect(
      loadSpxWeekdayData(QUERY, {
        dbPath: activeDbPath.current,
        fetcher: yahooFetchMock,
        now: () => NOW
      })
    ).rejects.toThrow("Yahoo unavailable");
  });
});

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "market-atlas-spx-service-"));
  tempDirs.push(dir);
  return join(dir, "test.sqlite");
}

function openDb() {
  const db = createMarketDataDb(activeDbPath.current);
  dbHandles.push(db);
  return db;
}

function seedCache({
  rows,
  successfulRefreshAt,
  fetchedAt
}: {
  rows: SpxDailyPrice[];
  successfulRefreshAt: string;
  fetchedAt: string;
}) {
  const db = openDb();
  initializeMarketDataSchema(db);
  upsertDataSource(db, SOURCE_INPUT);
  upsertSpxDailyPrices(db, rows, SPX_SOURCE_KEY);
  db.prepare("update spx_daily_prices set fetched_at = ?").run(fetchedAt);
  insertRefreshRun(db, "success", rows.length, rows.length, successfulRefreshAt);
}

function insertRefreshRun(
  db: MarketDataDb,
  status: "success" | "failure",
  rowsFetched: number,
  rowsChanged: number,
  finishedAt: string,
  errorMessage: string | null = null
) {
  db.prepare(`
    insert into refresh_runs
      (source_key, started_at, finished_at, status, rows_fetched, rows_changed, error_message)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(SPX_SOURCE_KEY, finishedAt, finishedAt, status, rowsFetched, rowsChanged, errorMessage);
}
