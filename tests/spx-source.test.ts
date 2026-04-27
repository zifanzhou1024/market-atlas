import { describe, expect, test } from "vitest";
import {
  buildYahooSpxChartUrl,
  parseYahooSpxChartJson,
  YAHOO_SPX_CHART_BASE_URL
} from "../lib/spx-source";

describe("parseYahooSpxChartJson", () => {
  test("parses SPX daily OHLC rows from Yahoo chart JSON and filters before 1993", () => {
    const payload = {
      chart: {
        result: [
          {
            timestamp: [725760000, 726105600, 726192000],
            indicators: {
              quote: [
                {
                  open: [435.71, 435.7, 435.38],
                  high: [439.77, 437.32, 435.4],
                  low: [435.71, 434.48, 433.55],
                  close: [435.71, 435.38, 434.34],
                  volume: [0, 0, null]
                }
              ]
            }
          }
        ]
      }
    };

    const rows = parseYahooSpxChartJson(payload);

    expect(YAHOO_SPX_CHART_BASE_URL).toContain("%5EGSPC");
    expect(buildYahooSpxChartUrl(new Date("2024-01-10T00:00:00.000Z"))).toContain(
      "interval=1d"
    );
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

  test("skips missing and non-finite rows", () => {
    const payload = {
      chart: {
        result: [
          {
            timestamp: [726105600, 726192000, 726278400],
            indicators: {
              quote: [
                {
                  open: [435.7, 436, Number.POSITIVE_INFINITY],
                  high: [437.32, 437, 438],
                  low: [434.48, 435, 436],
                  close: [435.38, null, 437],
                  volume: [0, 0, 0]
                }
              ]
            }
          }
        ]
      }
    };

    expect(parseYahooSpxChartJson(payload)).toHaveLength(1);
  });
});
