import type { ShillerPoint } from "./shiller";

export type ForwardPeComparisonPoint = {
  date: string;
  price: number;
  forwardEarnings: number;
  forwardEarningsDate: string;
  forwardPe: number;
  frequency?: ShillerPoint["frequency"];
};

export function buildForwardPeComparisonPoints(
  points: ShillerPoint[]
): ForwardPeComparisonPoint[] {
  const sortedPoints = [...points].sort((left, right) => left.date.localeCompare(right.date));

  return sortedPoints.reduce<ForwardPeComparisonPoint[]>((comparisonPoints, point) => {
    if (!isUsableNumber(point.price) || point.price <= 0) {
      return comparisonPoints;
    }

    const targetDate = addYears(point.date, 1);
    const forwardPoint = sortedPoints.find(
      (candidate) =>
        candidate.date >= targetDate &&
        isUsableNumber(candidate.earnings) &&
        candidate.earnings > 0
    );

    if (!forwardPoint || !isUsableNumber(forwardPoint.earnings)) {
      return comparisonPoints;
    }

    comparisonPoints.push({
      date: point.date,
      price: roundNumber(point.price),
      forwardEarnings: roundNumber(forwardPoint.earnings),
      forwardEarningsDate: forwardPoint.date,
      forwardPe: roundNumber(point.price / forwardPoint.earnings),
      frequency: point.frequency
    });

    return comparisonPoints;
  }, []);
}

function addYears(date: string, years: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString().slice(0, 10);
}

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}
