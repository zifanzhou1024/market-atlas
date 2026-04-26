import { describe, expect, it } from "vitest";
import {
  buildDateTicks,
  compressChartPoints,
  dateToChartRatio,
  filterPointsByWindow,
  getDateWindowForPreset,
  panDateWindow,
  resolveChartIndex,
  shouldApplyWheelZoom,
  zoomDateWindow
} from "../lib/chart-viewport";
import type { ShillerPoint } from "../lib/shiller";

const points: ShillerPoint[] = Array.from({ length: 11 }, (_, index) => ({
  date: `${2020 + index}-01-01`,
  cape: 20 + index,
  price: 3000 + index,
  earnings: 100,
  longRate: 4,
  frequency: "monthly"
}));

describe("getDateWindowForPreset", () => {
  it("creates a trailing date window from the latest point", () => {
    expect(getDateWindowForPreset(points, "5y")).toEqual({
      startDate: "2025-01-01",
      endDate: "2030-01-01"
    });
  });

  it("creates a one-year window for short-term charting", () => {
    expect(getDateWindowForPreset(points, "1y")).toEqual({
      startDate: "2029-01-01",
      endDate: "2030-01-01"
    });
  });
});

describe("zoomDateWindow", () => {
  it("zooms in around the anchor date and keeps the anchor inside the window", () => {
    const zoomed = zoomDateWindow(
      points,
      { startDate: "2020-01-01", endDate: "2030-01-01" },
      "in",
      "2028-01-01"
    );

    expect(Date.parse(zoomed.startDate)).toBeGreaterThan(Date.parse("2020-01-01"));
    expect(Date.parse(zoomed.endDate)).toBeLessThan(Date.parse("2030-01-01"));
    expect(filterPointsByWindow(points, zoomed).some((point) => point.date === "2028-01-01")).toBe(true);
  });

  it("uses a measured zoom-in step instead of cutting the window in half", () => {
    const zoomed = zoomDateWindow(
      points,
      { startDate: "2029-01-01", endDate: "2030-01-01" },
      "in",
      "2030-01-01"
    );

    expect(Date.parse(zoomed.startDate)).toBeGreaterThan(Date.parse("2029-01-01"));
    expect(Date.parse(zoomed.startDate)).toBeLessThan(Date.parse("2029-04-01"));
    expect(zoomed.endDate).toBe("2030-01-01");
  });

  it("zooms out without exceeding the available data domain", () => {
    const zoomed = zoomDateWindow(
      points,
      { startDate: "2025-01-01", endDate: "2027-01-01" },
      "out",
      "2026-01-01"
    );

    expect(Date.parse(zoomed.startDate)).toBeLessThan(Date.parse("2025-01-01"));
    expect(Date.parse(zoomed.endDate)).toBeGreaterThan(Date.parse("2027-01-01"));
  });
});

describe("panDateWindow", () => {
  it("moves the current date window by a ratio of its visible span", () => {
    expect(
      panDateWindow(
        points,
        { startDate: "2025-01-01", endDate: "2027-01-01" },
        0.5
      )
    ).toEqual({
      startDate: "2026-01-01",
      endDate: "2028-01-01"
    });
  });

  it("clamps panning at the available data edges", () => {
    expect(
      panDateWindow(
        points,
        { startDate: "2021-01-01", endDate: "2023-01-01" },
        -10
      )
    ).toEqual({
      startDate: "2020-01-01",
      endDate: "2021-12-31"
    });
  });
});

describe("buildDateTicks", () => {
  it("uses month-year labels for short zoomed windows", () => {
    const ticks = buildDateTicks(points.slice(3, 7), 4);

    expect(ticks.map((tick) => tick.label)).toEqual([
      "Jan 23",
      "Jan 24",
      "Jan 25",
      "Jan 26"
    ]);
  });

  it("keeps long windows on clean year labels", () => {
    const ticks = buildDateTicks(points, 4);

    expect(ticks.map((tick) => tick.label)).toEqual([
      "2020",
      "2023",
      "2027",
      "2030"
    ]);
  });

  it("places tick labels from elapsed time rather than point density", () => {
    const mixedDensityPoints: ShillerPoint[] = [
      { ...points[0], date: "2000-01-01" },
      { ...points[1], date: "2021-01-01" },
      { ...points[2], date: "2022-01-01" },
      { ...points[3], date: "2023-01-01" },
      { ...points[4], date: "2024-01-01" }
    ];

    expect(buildDateTicks(mixedDensityPoints, 3).map((tick) => tick.label)).toEqual([
      "2000",
      "2012",
      "2024"
    ]);
  });

  it("can anchor tick labels to the visible date window", () => {
    const ticks = buildDateTicks(points.slice(3, 7), 3, {
      startDate: "2022-07-01",
      endDate: "2026-07-01"
    });

    expect(ticks.map((tick) => tick.label)).toEqual([
      "Jul 22",
      "Jul 24",
      "Jul 26"
    ]);
  });
});

describe("dateToChartRatio", () => {
  it("maps dates by elapsed time instead of array position", () => {
    expect(
      dateToChartRatio("2012-01-01", {
        startDate: "2000-01-01",
        endDate: "2024-01-01"
      })
    ).toBeCloseTo(0.5, 2);
  });
});

describe("compressChartPoints", () => {
  it("keeps short windows uncompressed", () => {
    expect(compressChartPoints(points.slice(0, 5))).toHaveLength(5);
  });

  it("compresses long windows into lower-frequency OHLC buckets", () => {
    const monthlyPoints: ShillerPoint[] = Array.from({ length: 600 }, (_, index) => ({
      ...points[0],
      date: `${2000 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`,
      cape: 10 + index
    }));
    const compressed = compressChartPoints(monthlyPoints);

    expect(compressed.length).toBeLessThan(monthlyPoints.length);
    expect(compressed[0].capeOhlc).toEqual({
      open: 10,
      high: 12,
      low: 10,
      close: 12
    });
  });
});

describe("resolveChartIndex", () => {
  it("clamps stale hover indexes after a zoom changes the point count", () => {
    expect(resolveChartIndex(10, 24, 3)).toBe(9);
  });

  it("falls back to the selected index when nothing is hovered", () => {
    expect(resolveChartIndex(10, null, 3)).toBe(3);
  });
});

describe("shouldApplyWheelZoom", () => {
  it("rate-limits dense wheel events but accepts deliberate steps", () => {
    expect(shouldApplyWheelZoom(null, 1000)).toBe(true);
    expect(shouldApplyWheelZoom(1000, 1075)).toBe(false);
    expect(shouldApplyWheelZoom(1000, 1120)).toBe(true);
  });
});
