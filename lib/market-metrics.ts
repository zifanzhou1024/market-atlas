import type { ShillerPoint } from "./shiller";

export type ValuationBand = {
  label: "Cheap" | "Fair" | "Expensive" | "Extreme";
  tone: "green" | "blue" | "amber" | "red";
  description: string;
};

export type DashboardSnapshot = {
  latest: ShillerPoint;
  selected: ShillerPoint;
  band: ValuationBand;
  percentile: number;
  tenYearAverage: number;
  chartMin: number;
  chartMax: number;
};

export function getValuationBand(cape: number): ValuationBand {
  if (cape < 18) {
    return {
      label: "Cheap",
      tone: "green",
      description: "Below long-run valuation norms."
    };
  }

  if (cape < 28) {
    return {
      label: "Fair",
      tone: "blue",
      description: "Near the broad historical middle."
    };
  }

  if (cape < 40) {
    return {
      label: "Expensive",
      tone: "amber",
      description: "Above most historical observations."
    };
  }

  return {
    label: "Extreme",
    tone: "red",
    description: "Near the highest historical valuation regimes."
  };
}

export function getDashboardSnapshot(points: ShillerPoint[], selectedDate: string): DashboardSnapshot {
  if (points.length === 0) {
    throw new Error("Cannot summarize an empty Shiller dataset");
  }

  const latest = points[points.length - 1];
  const selected =
    [...points].reverse().find((point) => point.date <= selectedDate) ?? points[0];

  const trailingWindowStart = addYears(selected.date, -10);
  const trailingPoints = points.filter(
    (point) => point.date >= trailingWindowStart && point.date <= selected.date
  );
  const percentile =
    Math.round(
      (points.filter((point) => point.cape <= selected.cape).length / points.length) * 100
    );

  return {
    latest,
    selected,
    band: getValuationBand(selected.cape),
    percentile,
    tenYearAverage: average(trailingPoints.map((point) => point.cape)),
    chartMin: Math.min(...points.map((point) => point.cape)),
    chartMax: Math.max(...points.map((point) => point.cape))
  };
}

export function filterPointsByRange(points: ShillerPoint[], range: "5y" | "25y" | "50y" | "all") {
  if (range === "all" || points.length === 0) {
    return points;
  }

  const years = range === "5y" ? 5 : range === "25y" ? 25 : 50;
  const cutoff = addYears(points[points.length - 1].date, -years);
  return points.filter((point) => point.date >= cutoff);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function addYears(date: string, years: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString().slice(0, 10);
}
