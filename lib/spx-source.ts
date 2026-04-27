export type SpxDailyPrice = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export const YAHOO_SPX_CHART_BASE_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC";
export const SPX_START_DATE = "1993-01-01";

export function buildYahooSpxChartUrl(now = new Date()): string {
  const period1 = Math.floor(Date.UTC(1993, 0, 1) / 1000);
  const period2 = Math.floor(now.getTime() / 1000);
  return `${YAHOO_SPX_CHART_BASE_URL}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
}

export async function fetchYahooSpxChartJson(): Promise<unknown> {
  const response = await fetch(buildYahooSpxChartUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Yahoo Finance SPX source returned ${response.status}`);
  }

  return response.json();
}

export function parseYahooSpxChartJson(input: unknown): SpxDailyPrice[] {
  if (!input || typeof input !== "object") {
    return [];
  }

  const root = input as {
    chart?: {
      result?: Array<{
        timestamp?: unknown;
        indicators?: {
          quote?: Array<{
            open?: unknown;
            high?: unknown;
            low?: unknown;
            close?: unknown;
            volume?: unknown;
          }>;
        };
      }>;
    };
  };
  const result = root.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];

  if (!Array.isArray(result?.timestamp) || !quote) {
    return [];
  }

  const opens = toNullableNumberArray(quote.open);
  const highs = toNullableNumberArray(quote.high);
  const lows = toNullableNumberArray(quote.low);
  const closes = toNullableNumberArray(quote.close);
  const volumes = toNullableNumberArray(quote.volume);

  if (!opens || !highs || !lows || !closes) {
    return [];
  }

  return result.timestamp
    .map((timestamp, index) => {
      if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
        return null;
      }

      const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
      const open = opens[index];
      const high = highs[index];
      const low = lows[index];
      const close = closes[index];

      if (
        date < SPX_START_DATE ||
        !isFiniteNumber(open) ||
        !isFiniteNumber(high) ||
        !isFiniteNumber(low) ||
        !isFiniteNumber(close)
      ) {
        return null;
      }

      const volume = volumes?.[index];

      return {
        date,
        open,
        high,
        low,
        close,
        volume: isFiniteNumber(volume) ? volume : null
      };
    })
    .filter((row): row is SpxDailyPrice => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function toNullableNumberArray(value: unknown): Array<number | null> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((item) => (item === null || item === undefined ? null : Number(item)));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
