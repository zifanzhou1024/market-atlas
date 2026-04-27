import { describe, expect, it } from "vitest";
import {
  buildBuffettPoints,
  getBuffettBand,
  getBuffettSnapshot,
  parseWorldBankAnnualJson
} from "../lib/buffett";

describe("buildBuffettPoints", () => {
  it("aligns FRED equity market value and GDP by quarter and converts units", () => {
    const points = buildBuffettPoints(
      [
        { date: "2024-01-01", value: 58_000_000 },
        { date: "2024-04-01", value: 62_500_000 },
        { date: "2024-07-01", value: 64_000_000 }
      ],
      [
        { date: "2024-01-01", value: 29_000 },
        { date: "2024-07-01", value: 32_000 }
      ]
    );

    expect(points).toEqual([
      {
        date: "2024-01-01",
        marketValue: 58_000,
        gdp: 29_000,
        gdpDate: "2024-01-01",
        ratio: 200
      },
      {
        date: "2024-07-01",
        marketValue: 64_000,
        gdp: 32_000,
        gdpDate: "2024-07-01",
        ratio: 200
      }
    ]);
  });

  it("can compare quarterly market value to latest available annual world GDP", () => {
    const points = buildBuffettPoints(
      [
        { date: "2023-10-01", value: 50_000_000 },
        { date: "2024-01-01", value: 58_000_000 },
        { date: "2024-04-01", value: 62_500_000 }
      ],
      [
        { date: "2023-01-01", value: 100_000_000_000_000 },
        { date: "2024-01-01", value: 125_000_000_000_000 }
      ],
      {
        denominatorUnit: "dollars",
        alignment: "latestAtOrBefore"
      }
    );

    expect(points).toEqual([
      {
        date: "2023-10-01",
        marketValue: 50_000,
        gdp: 100_000,
        gdpDate: "2023-01-01",
        ratio: 50
      },
      {
        date: "2024-01-01",
        marketValue: 58_000,
        gdp: 125_000,
        gdpDate: "2024-01-01",
        ratio: 46.4
      },
      {
        date: "2024-04-01",
        marketValue: 62_500,
        gdp: 125_000,
        gdpDate: "2024-01-01",
        ratio: 50
      }
    ]);
  });

  it("can compare annual world market value to latest available annual world GDP", () => {
    const points = buildBuffettPoints(
      [
        { date: "2023-01-01", value: 100_000_000_000_000 },
        { date: "2024-01-01", value: 125_000_000_000_000 },
        { date: "2025-01-01", value: 140_000_000_000_000 }
      ],
      [
        { date: "2023-01-01", value: 100_000_000_000_000 },
        { date: "2024-01-01", value: 125_000_000_000_000 }
      ],
      {
        numeratorUnit: "dollars",
        denominatorUnit: "dollars",
        alignment: "latestAtOrBefore"
      }
    );

    expect(points).toEqual([
      {
        date: "2023-01-01",
        marketValue: 100_000,
        gdp: 100_000,
        gdpDate: "2023-01-01",
        ratio: 100
      },
      {
        date: "2024-01-01",
        marketValue: 125_000,
        gdp: 125_000,
        gdpDate: "2024-01-01",
        ratio: 100
      },
      {
        date: "2025-01-01",
        marketValue: 140_000,
        gdp: 125_000,
        gdpDate: "2024-01-01",
        ratio: 112
      }
    ]);
  });
});

describe("parseWorldBankAnnualJson", () => {
  it("parses World Bank annual rows into ascending date observations", () => {
    const rows = parseWorldBankAnnualJson([
      { page: 1, pages: 1 },
      [
        {
          date: "2025",
          value: 141_297_217_290_000
        },
        {
          date: "2024",
          value: null
        },
        {
          date: "2023",
          value: 102_946_352_260_000
        }
      ]
    ]);

    expect(rows).toEqual([
      { date: "2023-01-01", value: 102_946_352_260_000 },
      { date: "2025-01-01", value: 141_297_217_290_000 }
    ]);
  });
});

describe("getBuffettBand", () => {
  it("labels broad market valuation zones", () => {
    expect(getBuffettBand(70).label).toBe("Cheap");
    expect(getBuffettBand(100).label).toBe("Fair");
    expect(getBuffettBand(140).label).toBe("Expensive");
    expect(getBuffettBand(190).label).toBe("Extreme");
  });
});

describe("getBuffettSnapshot", () => {
  it("selects the latest point at or before the requested date", () => {
    const points = buildBuffettPoints(
      [
        { date: "2023-01-01", value: 45_000_000 },
        { date: "2024-01-01", value: 58_000_000 },
        { date: "2025-01-01", value: 66_000_000 }
      ],
      [
        { date: "2023-01-01", value: 25_000 },
        { date: "2024-01-01", value: 29_000 },
        { date: "2025-01-01", value: 30_000 }
      ]
    );

    const snapshot = getBuffettSnapshot(points, "2024-06-30");

    expect(snapshot.latest).toEqual(points[2]);
    expect(snapshot.selected).toEqual(points[1]);
    expect(snapshot.percentile).toBe(67);
    expect(snapshot.band.label).toBe("Extreme");
  });
});
