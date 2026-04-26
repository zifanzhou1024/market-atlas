import { describe, expect, it } from "vitest";
import { getDashboardSnapshot, getValuationBand } from "../lib/market-metrics";
import type { ShillerPoint } from "../lib/shiller";

const points: ShillerPoint[] = [
  { date: "2020-01-01", cape: 25, price: 3200, earnings: 130, longRate: 1.8 },
  { date: "2021-01-01", cape: 31, price: 3700, earnings: 140, longRate: 1.2 },
  { date: "2022-01-01", cape: 39, price: 4500, earnings: 160, longRate: 1.7 },
  { date: "2023-01-01", cape: 29, price: 3900, earnings: 170, longRate: 3.5 }
];

describe("getValuationBand", () => {
  it("labels valuation bands from CAPE levels", () => {
    expect(getValuationBand(15).label).toBe("Cheap");
    expect(getValuationBand(24).label).toBe("Fair");
    expect(getValuationBand(32).label).toBe("Expensive");
    expect(getValuationBand(41).label).toBe("Extreme");
  });
});

describe("getDashboardSnapshot", () => {
  it("selects the latest point at or before the chosen date and derives summary stats", () => {
    const snapshot = getDashboardSnapshot(points, "2022-06-15");

    expect(snapshot.selected).toEqual(points[2]);
    expect(snapshot.latest).toEqual(points[3]);
    expect(snapshot.percentile).toBe(100);
    expect(snapshot.tenYearAverage).toBe(31.7);
    expect(snapshot.band.label).toBe("Expensive");
  });
});
