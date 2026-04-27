import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  createMarketDataDb,
  DEFAULT_MARKET_DATA_DB_PATH,
  initializeMarketDataSchema
} from "../lib/market-data/db";
import { recordRefreshRun, upsertDataSource } from "../lib/market-data/sources";
import {
  getSpxCacheSummary,
  readSpxDailyPrices,
  upsertSpxDailyPrices
} from "../lib/market-data/spx-repository";

const SPX_SOURCE_KEY = "yahoo-spx-chart";
const SPX_SOURCE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC";
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
  test("initializes shared source metadata and records refresh runs", () => {
    expect(DEFAULT_MARKET_DATA_DB_PATH).toBe(join(process.cwd(), "data", "market-atlas.sqlite"));

    const db = createMarketDataDb(tempDbPath());

    initializeMarketDataSchema(db);
    upsertDataSource(db, {
      key: SPX_SOURCE_KEY,
      displayName: "Yahoo Finance SPX chart",
      provider: "Yahoo Finance",
      sourceUrl: SPX_SOURCE_URL
    });
    recordRefreshRun(db, {
      sourceKey: SPX_SOURCE_KEY,
      status: "success",
      rowsFetched: 2,
      rowsChanged: 2,
      errorMessage: null
    });

    const sources = db
      .prepare("select source_key, display_name, provider, source_url from data_sources")
      .all();
    const runs = db
      .prepare("select source_key, status, rows_fetched, rows_changed from refresh_runs")
      .all();

    expect(sources).toEqual([
      {
        source_key: SPX_SOURCE_KEY,
        display_name: "Yahoo Finance SPX chart",
        provider: "Yahoo Finance",
        source_url: SPX_SOURCE_URL
      }
    ]);
    expect(runs).toMatchObject([
      {
        source_key: SPX_SOURCE_KEY,
        status: "success",
        rows_fetched: 2,
        rows_changed: 2
      }
    ]);
  });

  test("upserts and reads SPX daily prices in date order with a cache summary", () => {
    const db = createMarketDataDb(tempDbPath());
    initializeMarketDataSchema(db);
    upsertDataSource(db, {
      key: SPX_SOURCE_KEY,
      displayName: "Yahoo Finance SPX chart",
      provider: "Yahoo Finance",
      sourceUrl: SPX_SOURCE_URL
    });

    upsertSpxDailyPrices(
      db,
      [
        {
          date: "1993-01-05",
          open: 435.38,
          high: 435.4,
          low: 433.55,
          close: 434.34,
          volume: 0
        },
        {
          date: "1993-01-04",
          open: 435.7,
          high: 437.32,
          low: 434.48,
          close: 435.38,
          volume: 0
        }
      ],
      SPX_SOURCE_KEY
    );

    upsertSpxDailyPrices(
      db,
      [
        {
          date: "1993-01-05",
          open: 436,
          high: 437,
          low: 435,
          close: 436.5,
          volume: 10
        }
      ],
      SPX_SOURCE_KEY
    );

    expect(readSpxDailyPrices(db)).toEqual([
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
        open: 436,
        high: 437,
        low: 435,
        close: 436.5,
        volume: 10
      }
    ]);
    expect(getSpxCacheSummary(db)).toMatchObject({
      rowCount: 2,
      firstDate: "1993-01-04",
      latestDate: "1993-01-05"
    });
  });
});
