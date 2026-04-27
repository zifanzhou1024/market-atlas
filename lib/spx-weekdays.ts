import type { SpxDailyPrice } from "./spx-source";

export type SpxRange = "1m" | "3m" | "6m" | "1y" | "2y" | "5y" | "10y" | "all";
export type SpxReturnMethod = "openClose" | "closeClose";
export type WeekdayName = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";

export type SpxWeekdayReturn = {
  date: string;
  weekday: WeekdayName;
  returnPct: number;
  cumulativeReturn: number;
};

export type SpxWeekdayStat = {
  weekday: WeekdayName;
  averageReturn: number;
  totalReturn: number;
  winRate: number;
  sampleCount: number;
  bestReturn: number | null;
  bestDate: string | null;
  worstReturn: number | null;
  worstDate: string | null;
};

export type SpxWeekdayDataset = {
  range: SpxRange;
  method: SpxReturnMethod;
  startDate: string | null;
  endDate: string | null;
  summaryPoints: SpxWeekdayStat[];
  weekdayStats: SpxWeekdayStat[];
  cumulativeSeries: Array<{
    weekday: WeekdayName;
    points: SpxWeekdayReturn[];
  }>;
};

const WEEKDAYS: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export function filterSpxRange(rows: SpxDailyPrice[], range: SpxRange): SpxDailyPrice[] {
  const sortedRows = sortSpxRows(rows);

  if (range === "all" || sortedRows.length === 0) {
    return sortedRows;
  }

  const latestDate = sortedRows[sortedRows.length - 1].date;
  const cutoffDate = shiftUtcDate(latestDate, range);

  return sortedRows.filter((row) => row.date > cutoffDate);
}

export function buildSpxWeekdayDataset(
  rows: SpxDailyPrice[],
  options: { range: SpxRange; method: SpxReturnMethod }
): SpxWeekdayDataset {
  const sortedRows = sortSpxRows(rows);
  const visibleRows = filterSpxRange(rows, options.range);
  const visibleDates = new Set(visibleRows.map((row) => row.date));
  const groupedReturns = groupReturnsByWeekday(
    buildReturns(sortedRows, options.method, visibleDates)
  );
  const cumulativeSeries = WEEKDAYS.map((weekday) =>
    buildCumulativeSeries(weekday, groupedReturns.get(weekday) ?? [])
  );
  const weekdayStats = cumulativeSeries.map((series) =>
    summarizeWeekday(series.weekday, series.points)
  );

  return {
    range: options.range,
    method: options.method,
    startDate: visibleRows[0]?.date ?? null,
    endDate: visibleRows[visibleRows.length - 1]?.date ?? null,
    summaryPoints: weekdayStats,
    weekdayStats,
    cumulativeSeries
  };
}

function sortSpxRows(rows: SpxDailyPrice[]): SpxDailyPrice[] {
  return [...rows].sort((left, right) => left.date.localeCompare(right.date));
}

function groupReturnsByWeekday(returns: SpxWeekdayReturn[]): Map<WeekdayName, SpxWeekdayReturn[]> {
  const grouped = new Map<WeekdayName, SpxWeekdayReturn[]>(
    WEEKDAYS.map((weekday) => [weekday, []])
  );

  for (const item of returns) {
    grouped.get(item.weekday)?.push(item);
  }

  return grouped;
}

function buildCumulativeSeries(
  weekday: WeekdayName,
  points: SpxWeekdayReturn[]
): { weekday: WeekdayName; points: SpxWeekdayReturn[] } {
  let cumulative = 1;

  return {
    weekday,
    points: points.map((point) => {
      cumulative *= 1 + point.returnPct / 100;

      return {
        ...point,
        cumulativeReturn: roundNumber((cumulative - 1) * 100)
      };
    })
  };
}

function buildReturns(
  rows: SpxDailyPrice[],
  method: SpxReturnMethod,
  visibleDates: Set<string>
): SpxWeekdayReturn[] {
  return rows.reduce<SpxWeekdayReturn[]>((items, row, index) => {
    const weekday = getWeekdayName(row.date);

    if (!weekday || !visibleDates.has(row.date)) {
      return items;
    }

    const base = method === "openClose" ? row.open : rows[index - 1]?.close;

    if (!isPositiveNumber(base)) {
      return items;
    }

    items.push({
      date: row.date,
      weekday,
      returnPct: roundNumber(((row.close - base) / base) * 100),
      cumulativeReturn: 0
    });

    return items;
  }, []);
}

function summarizeWeekday(weekday: WeekdayName, points: SpxWeekdayReturn[]): SpxWeekdayStat {
  if (points.length === 0) {
    return {
      weekday,
      averageReturn: 0,
      totalReturn: 0,
      winRate: 0,
      sampleCount: 0,
      bestReturn: null,
      bestDate: null,
      worstReturn: null,
      worstDate: null
    };
  }

  const best = points.reduce((currentBest, point) =>
    point.returnPct > currentBest.returnPct ? point : currentBest
  );
  const worst = points.reduce((currentWorst, point) =>
    point.returnPct < currentWorst.returnPct ? point : currentWorst
  );

  return {
    weekday,
    averageReturn: roundNumber(
      points.reduce((sum, point) => sum + point.returnPct, 0) / points.length
    ),
    totalReturn: points[points.length - 1].cumulativeReturn,
    winRate: roundNumber(
      (points.filter((point) => point.returnPct > 0).length / points.length) * 100
    ),
    sampleCount: points.length,
    bestReturn: best.returnPct,
    bestDate: best.date,
    worstReturn: worst.returnPct,
    worstDate: worst.date
  };
}

function getWeekdayName(date: string): WeekdayName | null {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();

  return day >= 1 && day <= 5 ? WEEKDAYS[day - 1] : null;
}

function shiftUtcDate(date: string, range: Exclude<SpxRange, "all">): string {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  const monthsByRange: Record<Exclude<SpxRange, "all">, number> = {
    "1m": 1,
    "3m": 3,
    "6m": 6,
    "1y": 12,
    "2y": 24,
    "5y": 60,
    "10y": 120
  };

  parsedDate.setUTCMonth(parsedDate.getUTCMonth() - monthsByRange[range]);

  return parsedDate.toISOString().slice(0, 10);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}
