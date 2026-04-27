import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, test } from "vitest";
import {
  createMarketDataDb,
  DEFAULT_MARKET_DATA_DB_PATH,
  type MarketDataDb,
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
const dbHandles: MarketDataDb[] = [];

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "market-atlas-"));
  tempDirs.push(dir);
  return join(dir, "test.sqlite");
}

function openTempDb(dbPath = tempDbPath()) {
  const db = createMarketDataDb(dbPath);
  dbHandles.push(db);
  return db;
}

afterEach(() => {
  while (dbHandles.length > 0) {
    dbHandles.pop()?.close();
  }

  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { force: true, recursive: true });
  }
});

describe("market data database", () => {
  test("initializes shared source metadata and records refresh runs", () => {
    expect(DEFAULT_MARKET_DATA_DB_PATH).toBe(join(process.cwd(), "data", "market-atlas.sqlite"));

    const db = openTempDb();

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
    const db = openTempDb();
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

  test("waits through brief SQLite write lock contention", async () => {
    const dbPath = tempDbPath();
    const setupDb = openTempDb(dbPath);
    initializeMarketDataSchema(setupDb);
    upsertDataSource(setupDb, {
      key: SPX_SOURCE_KEY,
      displayName: "Yahoo Finance SPX chart",
      provider: "Yahoo Finance",
      sourceUrl: SPX_SOURCE_URL
    });

    const lock = await holdImmediateTransaction(dbPath);

    try {
      const contendedDb = openTempDb(dbPath);

      recordRefreshRun(contendedDb, {
        sourceKey: SPX_SOURCE_KEY,
        status: "success",
        rowsFetched: 1,
        rowsChanged: 1,
        errorMessage: null
      });

      expect(contendedDb.prepare("select count(*) as count from refresh_runs").get()).toEqual({
        count: 1
      });
    } finally {
      await lock.released;
    }
  });
});

function holdImmediateTransaction(dbPath: string) {
  const worker = new Worker(
    `
      const { workerData, parentPort } = require("node:worker_threads");
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(workerData.dbPath);

      try {
        db.exec("begin immediate");
        parentPort.postMessage("locked");

        setTimeout(() => {
          try {
            db.exec("commit");
            db.close();
            process.exit(0);
          } catch (error) {
            parentPort.postMessage({
              error: error instanceof Error ? error.message : String(error)
            });
            process.exit(1);
          }
        }, workerData.holdMs);
      } catch (error) {
        parentPort.postMessage({
          error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
      }
    `,
    { eval: true, workerData: { dbPath, holdMs: 150 } }
  );

  const released = new Promise<void>((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`SQLite lock worker exited with code ${code}`));
    });
  });

  return new Promise<{ released: Promise<void> }>((resolve, reject) => {
    worker.on("message", (message: unknown) => {
      if (message === "locked") {
        resolve({ released });
        return;
      }

      if (
        message &&
        typeof message === "object" &&
        "error" in message &&
        typeof message.error === "string"
      ) {
        reject(new Error(message.error));
      }
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`SQLite lock worker exited with code ${code}`));
      }
    });
  });
}
