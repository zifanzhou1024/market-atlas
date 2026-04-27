import { describe, expect, test } from "vitest";
import {
  buildSpxWeekdayDataset,
  filterSpxRange,
  normalizeSpxWeekdayQuery,
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
  test("filters trailing one month by the latest trading date", () => {
    const rows: SpxDailyPrice[] = [
      { date: "2023-11-30", open: 1, high: 1, low: 1, close: 1, volume: null },
      { date: "2024-01-01", open: 2, high: 2, low: 2, close: 2, volume: null }
    ];

    expect(filterSpxRange(rows, "1m").map((row) => row.date)).toEqual(["2024-01-01"]);
  });

  test("keeps month-end rows at the trailing range cutoff", () => {
    const rows: SpxDailyPrice[] = [
      { date: "2024-02-29", open: 1, high: 1, low: 1, close: 1, volume: null },
      { date: "2024-03-02", open: 2, high: 2, low: 2, close: 2, volume: null },
      { date: "2024-03-31", open: 3, high: 3, low: 3, close: 3, volume: null }
    ];

    expect(filterSpxRange(rows, "1m").map((row) => row.date)).toEqual([
      "2024-02-29",
      "2024-03-02",
      "2024-03-31"
    ]);
  });

  test("filters YTD from the first calendar day of the latest trading year", () => {
    const rows: SpxDailyPrice[] = [
      { date: "2023-12-29", open: 1, high: 1, low: 1, close: 1, volume: null },
      { date: "2024-01-02", open: 2, high: 2, low: 2, close: 2, volume: null },
      { date: "2024-04-26", open: 3, high: 3, low: 3, close: 3, volume: null }
    ];

    expect(filterSpxRange(rows, "ytd").map((row) => row.date)).toEqual([
      "2024-01-02",
      "2024-04-26"
    ]);
  });
});

describe("normalizeSpxWeekdayQuery", () => {
  test("normalizes invalid SPX weekday query params to defaults", () => {
    expect(normalizeSpxWeekdayQuery({ range: "bad", method: "bad" })).toEqual({
      range: "1y",
      method: "openClose"
    });
    expect(normalizeSpxWeekdayQuery({ range: "10y", method: "closeClose" })).toEqual({
      range: "10y",
      method: "closeClose"
    });
    expect(normalizeSpxWeekdayQuery({ range: "ytd", method: "openClose" })).toEqual({
      range: "ytd",
      method: "openClose"
    });
  });
});

describe("buildSpxWeekdayDataset", () => {
  test.each<SpxReturnMethod>(["openClose", "closeClose"])(
    "returns Monday through Friday stats, summary, and cumulative series for %s",
    (method) => {
      const dataset = buildSpxWeekdayDataset(sampleRows, {
        range: "all",
        method
      });

      const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

      expect(dataset).toMatchObject({
        range: "all",
        method,
        startDate: "2024-01-01",
        endDate: "2024-01-09"
      });
      expect(dataset.weekdayStats.map((stat) => stat.weekday)).toEqual(weekdays);
      expect(dataset.summaryPoints.map((stat) => stat.weekday)).toEqual(weekdays);
      expect(dataset.cumulativeSeries.map((series) => series.weekday)).toEqual(weekdays);
      expect(dataset.weekdayStats.find((stat) => stat.weekday === "Thursday")).toMatchObject({
        averageReturn: 0,
        totalReturn: 0,
        winRate: 0,
        sampleCount: 0,
        bestReturn: null,
        bestDate: null,
        worstReturn: null,
        worstDate: null
      });
    }
  );

  test("computes open-to-close returns by current trading weekday", () => {
    const dataset = buildSpxWeekdayDataset(sampleRows, {
      range: "all",
      method: "openClose"
    });

    const monday = dataset.weekdayStats.find((stat) => stat.weekday === "Monday");
    const friday = dataset.weekdayStats.find((stat) => stat.weekday === "Friday");
    const mondaySeries = dataset.cumulativeSeries.find((series) => series.weekday === "Monday");

    expect(monday).toMatchObject({
      averageReturn: 0.97,
      totalReturn: 1.95,
      winRate: 100,
      sampleCount: 2,
      bestReturn: 1,
      bestDate: "2024-01-01",
      worstReturn: 0.94,
      worstDate: "2024-01-08"
    });
    expect(friday).toMatchObject({
      averageReturn: 4.95,
      totalReturn: 4.95,
      winRate: 100,
      sampleCount: 1
    });
    expect(mondaySeries?.points).toEqual([
      { date: "2024-01-01", weekday: "Monday", returnPct: 1, cumulativeReturn: 1 },
      { date: "2024-01-08", weekday: "Monday", returnPct: 0.94, cumulativeReturn: 1.95 }
    ]);
  });

  test("computes close-to-close returns from the previous available trading close", () => {
    const dataset = buildSpxWeekdayDataset(sampleRows, {
      range: "all",
      method: "closeClose"
    });

    const monday = dataset.weekdayStats.find((stat) => stat.weekday === "Monday");
    const tuesday = dataset.weekdayStats.find((stat) => stat.weekday === "Tuesday");
    const friday = dataset.weekdayStats.find((stat) => stat.weekday === "Friday");
    const thursday = dataset.weekdayStats.find((stat) => stat.weekday === "Thursday");
    const fridaySeries = dataset.cumulativeSeries.find((series) => series.weekday === "Friday");

    expect(tuesday).toMatchObject({
      averageReturn: 2.42,
      totalReturn: 4.89,
      sampleCount: 2,
      bestReturn: 2.97,
      bestDate: "2024-01-02",
      worstReturn: 1.87,
      worstDate: "2024-01-09"
    });
    expect(friday).toMatchObject({
      averageReturn: 4.95,
      totalReturn: 4.95,
      sampleCount: 1
    });
    expect(monday).toMatchObject({
      averageReturn: 0.94,
      sampleCount: 1
    });
    expect(thursday?.sampleCount).toBe(0);
    expect(fridaySeries?.points).toEqual([
      { date: "2024-01-05", weekday: "Friday", returnPct: 4.95, cumulativeReturn: 4.95 }
    ]);
  });

  test("uses the prior trading close just outside the selected range", () => {
    const dataset = buildSpxWeekdayDataset(
      [
        { date: "2023-12-29", open: 100, high: 100, low: 100, close: 100, volume: 0 },
        { date: "2024-01-02", open: 101, high: 105, low: 101, close: 105, volume: 0 },
        { date: "2024-01-31", open: 105, high: 110, low: 105, close: 110, volume: 0 }
      ],
      {
        range: "1m",
        method: "closeClose"
      }
    );

    const tuesday = dataset.weekdayStats.find((stat) => stat.weekday === "Tuesday");

    expect(dataset.startDate).toBe("2024-01-02");
    expect(tuesday).toMatchObject({
      averageReturn: 5,
      totalReturn: 5,
      sampleCount: 1,
      bestReturn: 5,
      bestDate: "2024-01-02"
    });
  });

  test("keeps raw tiny returns for cumulative math before rounding public output", () => {
    const dataset = buildSpxWeekdayDataset(
      [
        { date: "2024-01-01", open: 100000, high: 100004, low: 100000, close: 100004, volume: 0 },
        { date: "2024-01-08", open: 100000, high: 100004, low: 100000, close: 100004, volume: 0 }
      ],
      {
        range: "all",
        method: "openClose"
      }
    );

    const monday = dataset.weekdayStats.find((stat) => stat.weekday === "Monday");
    const mondaySeries = dataset.cumulativeSeries.find((series) => series.weekday === "Monday");

    expect(monday).toMatchObject({
      averageReturn: 0,
      totalReturn: 0.01,
      winRate: 100,
      sampleCount: 2,
      bestReturn: 0,
      worstReturn: 0
    });
    expect(mondaySeries?.points).toEqual([
      { date: "2024-01-01", weekday: "Monday", returnPct: 0, cumulativeReturn: 0 },
      { date: "2024-01-08", weekday: "Monday", returnPct: 0, cumulativeReturn: 0.01 }
    ]);
  });
});
