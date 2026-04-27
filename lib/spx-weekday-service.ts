import {
  createMarketDataDb,
  initializeMarketDataSchema
} from "./market-data/db";
import {
  getRefreshRunSummary,
  recordRefreshRun,
  upsertDataSource
} from "./market-data/sources";
import {
  type SpxCacheSummary,
  getSpxCacheSummary,
  readSpxDailyPrices,
  upsertSpxDailyPrices
} from "./market-data/spx-repository";
import {
  fetchYahooSpxChartJson,
  parseYahooSpxChartJson,
  YAHOO_SPX_CHART_BASE_URL
} from "./spx-source";
import {
  buildSpxWeekdayDataset,
  type SpxRange,
  type SpxReturnMethod
} from "./spx-weekdays";

const SPX_SOURCE_KEY = "yahoo-spx-chart";
const SPX_SOURCE_DISPLAY_NAME = "Yahoo Finance SPX chart";
const SPX_SOURCE_PROVIDER = "Yahoo Finance";
const DEFAULT_SPX_CACHE_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const DEFAULT_FAILED_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export type LoadSpxWeekdayDataOptions = {
  dbPath?: string;
  fetcher?: () => Promise<unknown>;
  now?: () => Date;
  staleAfterMs?: number;
  failedRefreshCooldownMs?: number;
};

export type SpxWeekdayPayload = ReturnType<typeof buildSpxWeekdayDataset> & {
  source: {
    key: string;
    name: string;
    displayName: string;
    provider: string;
    url: string;
  };
  database: {
    latestDate: string | null;
    firstDate: string | null;
    latestFetchedAt: string | null;
    rowCount: number;
    lastSuccessfulRefreshAt: string | null;
    lastAttemptedRefreshAt: string | null;
  };
  warning: string | null;
};

export async function loadSpxWeekdayData(query: {
  range: SpxRange;
  method: SpxReturnMethod;
}, options: LoadSpxWeekdayDataOptions = {}): Promise<SpxWeekdayPayload> {
  const db = createMarketDataDb(options.dbPath);
  const now = options.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const fetcher = options.fetcher ?? fetchYahooSpxChartJson;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_SPX_CACHE_STALE_AFTER_MS;
  const failedRefreshCooldownMs =
    options.failedRefreshCooldownMs ?? DEFAULT_FAILED_REFRESH_COOLDOWN_MS;

  try {
    initializeMarketDataSchema(db);
    upsertDataSource(db, {
      key: SPX_SOURCE_KEY,
      displayName: SPX_SOURCE_DISPLAY_NAME,
      provider: SPX_SOURCE_PROVIDER,
      sourceUrl: YAHOO_SPX_CHART_BASE_URL
    });

    let warning: string | null = null;
    const initialCache = getSpxCacheSummary(db);
    const initialRefresh = getRefreshRunSummary(db, SPX_SOURCE_KEY);

    if (
      shouldRefreshSpxCache(
        initialCache,
        initialRefresh.lastSuccessfulRefreshAt,
        initialRefresh.lastAttemptedRefreshAt,
        now,
        staleAfterMs,
        failedRefreshCooldownMs
      )
    ) {
      try {
        const payload = await fetcher();
        const rows = parseYahooSpxChartJson(payload);

        if (rows.length === 0) {
          throw new Error("Yahoo Finance SPX chart payload did not contain usable rows");
        }

        const rowsChanged = upsertSpxDailyPrices(db, rows, SPX_SOURCE_KEY, nowIso);
        recordRefreshRun(db, {
          sourceKey: SPX_SOURCE_KEY,
          status: "success",
          rowsFetched: rows.length,
          rowsChanged,
          errorMessage: null
        }, now);
      } catch (error) {
        warning = error instanceof Error ? error.message : "Unable to refresh SPX data";
        recordRefreshRun(db, {
          sourceKey: SPX_SOURCE_KEY,
          status: "failure",
          rowsFetched: 0,
          rowsChanged: 0,
          errorMessage: warning
        }, now);
      }
    }

    const prices = readSpxDailyPrices(db);
    const cache = getSpxCacheSummary(db);
    const refresh = getRefreshRunSummary(db, SPX_SOURCE_KEY);

    if (prices.length === 0) {
      throw new Error(warning ?? "No SPX data is available in the local cache");
    }

    return {
      ...buildSpxWeekdayDataset(prices, query),
      source: {
        key: SPX_SOURCE_KEY,
        name: SPX_SOURCE_DISPLAY_NAME,
        displayName: SPX_SOURCE_DISPLAY_NAME,
        provider: SPX_SOURCE_PROVIDER,
        url: YAHOO_SPX_CHART_BASE_URL
      },
      database: {
        latestDate: cache.latestDate,
        firstDate: cache.firstDate,
        latestFetchedAt: cache.latestFetchedAt,
        rowCount: cache.rowCount,
        lastSuccessfulRefreshAt: refresh.lastSuccessfulRefreshAt,
        lastAttemptedRefreshAt: refresh.lastAttemptedRefreshAt
      },
      warning
    };
  } finally {
    db.close();
  }
}

function shouldRefreshSpxCache(
  cache: SpxCacheSummary,
  lastSuccessfulRefreshAt: string | null,
  lastAttemptedRefreshAt: string | null,
  now: Date,
  staleAfterMs: number,
  failedRefreshCooldownMs: number
): boolean {
  if (cache.rowCount === 0) {
    return true;
  }

  if (isWithinRefreshWindow(lastAttemptedRefreshAt, now, failedRefreshCooldownMs)) {
    return false;
  }

  if (!lastSuccessfulRefreshAt) {
    return true;
  }

  const lastSuccessfulRefreshMs = Date.parse(lastSuccessfulRefreshAt);

  return (
    !Number.isFinite(lastSuccessfulRefreshMs) ||
    now.getTime() - lastSuccessfulRefreshMs > staleAfterMs
  );
}

function isWithinRefreshWindow(
  timestamp: string | null,
  now: Date,
  durationMs: number
): boolean {
  if (!timestamp) {
    return false;
  }

  const timestampMs = Date.parse(timestamp);

  return Number.isFinite(timestampMs) && now.getTime() - timestampMs <= durationMs;
}
