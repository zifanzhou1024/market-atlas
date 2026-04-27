import { describe, expect, test } from "vitest";
import { parseStooqDailyCsv, STOOQ_SPX_DAILY_URL } from "../lib/spx-source";

describe("parseStooqDailyCsv", () => {
  test("parses SPX daily OHLC rows from Stooq CSV and filters before 1993", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "1993-01-05,435.38,435.40,433.55,434.34,",
      "1992-12-31,435.71,439.77,435.71,435.71,0",
      "1993-01-04,435.70,437.32,434.48,435.38,0"
    ].join("\n");

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
        volume: null
      }
    ]);
  });

  test("skips malformed and non-finite rows", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "1993-01-04,435.70,437.32,434.48,435.38,0",
      "not-a-date,1,2,3,4,5",
      "1993-01-06,436.00,437.00,435.00,N/D,0",
      "1993-01-07,Infinity,437.00,435.00,436.50,0"
    ].join("\n");

    expect(parseStooqDailyCsv(csv)).toHaveLength(1);
  });
});
