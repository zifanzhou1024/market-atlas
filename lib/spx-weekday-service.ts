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
  buildYahooSpxChartUrl,
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
    rowCount: number;
  };
  warning: string | null;
};

export async function loadSpxWeekdayData(query: {
  range: SpxRange;
  method: SpxReturnMethod;
}): Promise<SpxWeekdayPayload> {
  const db = createMarketDataDb();

  try {
    initializeMarketDataSchema(db);
    upsertDataSource(db, {
      key: SPX_SOURCE_KEY,
      displayName: SPX_SOURCE_DISPLAY_NAME,
      provider: SPX_SOURCE_PROVIDER,
      sourceUrl: YAHOO_SPX_CHART_BASE_URL
    });

    let warning: string | null = null;

    try {
      const payload = await fetchYahooSpxChartJson();
      const rows = parseYahooSpxChartJson(payload);

      if (rows.length === 0) {
        throw new Error("Yahoo Finance SPX chart payload did not contain usable rows");
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
        name: SPX_SOURCE_DISPLAY_NAME,
        displayName: SPX_SOURCE_DISPLAY_NAME,
        provider: SPX_SOURCE_PROVIDER,
        url: buildYahooSpxChartUrl()
      },
      database: {
        latestDate: cache.latestDate,
        firstDate: cache.firstDate,
        rowCount: cache.rowCount
      },
      warning
    };
  } finally {
    db.close();
  }
}
