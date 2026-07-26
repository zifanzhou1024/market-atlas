import { describe, expect, it } from "vitest";
import { buildForwardPeComparisonPoints } from "../lib/forward-pe";
import type { ShillerPoint } from "../lib/shiller";

const points: ShillerPoint[] = [
  {
    date: "2020-01-01",
    cape: 22,
    price: 3200,
    earnings: 130,
    longRate: 1.8,
    frequency: "monthly"
  },
  {
    date: "2020-02-01",
    cape: 23,
    price: 3300,
    earnings: 132,
    longRate: 1.7,
    frequency: "monthly"
  },
  {
    date: "2021-01-01",
    cape: 24,
    price: 3700,
    earnings: 160,
    longRate: 1.2,
    frequency: "monthly"
  },
  {
    date: "2021-02-01",
    cape: 25,
    price: 3800,
    earnings: 0,
    longRate: 1.4,
    frequency: "monthly"
  },
  {
    date: "2021-03-01",
    cape: 26,
    price: 3900,
    earnings: 150,
    longRate: 1.5,
    frequency: "monthly"
  }
];

describe("buildForwardPeComparisonPoints", () => {
  it("compares current SPX price against the first usable one-year-ahead earnings value", () => {
    expect(buildForwardPeComparisonPoints(points)).toEqual([
      {
        date: "2020-01-01",
        price: 3200,
        forwardEarnings: 160,
        forwardEarningsDate: "2021-01-01",
        forwardPe: 20,
        frequency: "monthly"
      },
      {
        date: "2020-02-01",
        price: 3300,
        forwardEarnings: 150,
        forwardEarningsDate: "2021-03-01",
        forwardPe: 22,
        frequency: "monthly"
      }
    ]);
  });
});
