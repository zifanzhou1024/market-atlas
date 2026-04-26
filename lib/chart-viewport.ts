import type { ShillerPoint } from "./shiller";

export type ChartPreset = "1y" | "5y" | "25y" | "50y" | "all";

export type DateWindow = {
  startDate: string;
  endDate: string;
};

export type DateTick = {
  index: number;
  date: string;
  label: string;
};

export function getDateWindowForPreset(
  points: ShillerPoint[],
  preset: ChartPreset
): DateWindow {
  if (points.length === 0) {
    return { startDate: "", endDate: "" };
  }

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;

  if (preset === "all") {
    return { startDate: firstDate, endDate: lastDate };
  }

  const years =
    preset === "1y" ? 1 : preset === "5y" ? 5 : preset === "25y" ? 25 : 50;

  return {
    startDate: maxDate(addYears(lastDate, -years), firstDate),
    endDate: lastDate
  };
}

export function filterPointsByWindow(
  points: ShillerPoint[],
  window: DateWindow
): ShillerPoint[] {
  return points.filter(
    (point) => point.date >= window.startDate && point.date <= window.endDate
  );
}

export function zoomDateWindow(
  points: ShillerPoint[],
  window: DateWindow,
  direction: "in" | "out",
  anchorDate: string
): DateWindow {
  if (points.length === 0 || !window.startDate || !window.endDate) {
    return window;
  }

  const domainStart = dateToTime(points[0].date);
  const domainEnd = dateToTime(points[points.length - 1].date);
  const start = dateToTime(window.startDate);
  const end = dateToTime(window.endDate);
  const anchor = clamp(dateToTime(anchorDate), start, end);
  const zoomStep = 0.85;
  const scale = direction === "in" ? zoomStep : 1 / zoomStep;
  const minimumWindowMs = 1000 * 60 * 60 * 24 * 14;
  const nextLength = Math.max((end - start) * scale, minimumWindowMs);

  if (nextLength >= domainEnd - domainStart) {
    return {
      startDate: timeToDate(domainStart),
      endDate: timeToDate(domainEnd)
    };
  }

  const anchorRatio = (anchor - start) / (end - start || 1);
  const nextStart = anchor - nextLength * anchorRatio;
  const nextEnd = nextStart + nextLength;
  const clamped = clampWindow(nextStart, nextEnd, domainStart, domainEnd);

  return {
    startDate: timeToDate(clamped.start),
    endDate: timeToDate(clamped.end)
  };
}

export function panDateWindow(
  points: ShillerPoint[],
  window: DateWindow,
  deltaRatio: number
): DateWindow {
  if (points.length === 0 || !window.startDate || !window.endDate) {
    return window;
  }

  const domainStart = dateToTime(points[0].date);
  const domainEnd = dateToTime(points[points.length - 1].date);
  const start = dateToTime(window.startDate);
  const end = dateToTime(window.endDate);
  const length = end - start;

  if (length <= 0 || length >= domainEnd - domainStart) {
    return window;
  }

  const offset = length * deltaRatio;
  const clamped = clampWindow(start + offset, end + offset, domainStart, domainEnd);

  return {
    startDate: timeToDate(clamped.start),
    endDate: timeToDate(clamped.end)
  };
}

export function buildDateTicks(
  points: ShillerPoint[],
  count: number,
  window?: DateWindow
): DateTick[] {
  if (points.length === 0) {
    return [];
  }

  const startDate = window?.startDate || points[0].date;
  const endDate = window?.endDate || points[points.length - 1].date;

  if (points.length === 1 || count <= 1) {
    return [{ index: 0, date: startDate, label: formatAxisDate(startDate, 0) }];
  }

  const start = dateToTime(startDate);
  const end = dateToTime(endDate);
  const span = end - start;

  return Array.from({ length: count }, (_, tickIndex) => {
    const date = timeToDate(start + span * (tickIndex / (count - 1)));
    const index = nearestPointIndexByDate(points, date);
    return {
      index,
      date,
      label: formatAxisDate(date, span)
    };
  }).filter(
    (tick, index, ticks) =>
      ticks.findIndex((candidate) => candidate.label === tick.label) === index
  );
}

export function dateToChartRatio(date: string, window: DateWindow) {
  if (!window.startDate || !window.endDate) {
    return 0;
  }

  const start = dateToTime(window.startDate);
  const end = dateToTime(window.endDate);

  if (end <= start) {
    return 0;
  }

  return clamp((dateToTime(date) - start) / (end - start), 0, 1);
}

export function compressChartPoints(points: ShillerPoint[]): ShillerPoint[] {
  if (points.length < 2) {
    return points;
  }

  const spanDays =
    (dateToTime(points[points.length - 1].date) - dateToTime(points[0].date)) /
    (1000 * 60 * 60 * 24);

  if (spanDays <= 366 * 8) {
    return points;
  }

  const bucketSize = spanDays <= 366 * 80 ? "quarter" : "year";
  const buckets = new Map<string, ShillerPoint[]>();

  for (const point of points) {
    const key = bucketKey(point.date, bucketSize);
    buckets.set(key, [...(buckets.get(key) ?? []), point]);
  }

  return Array.from(buckets.values()).map((bucket) => compressBucket(bucket, bucketSize));
}

export function resolveChartIndex(
  pointCount: number,
  hoveredIndex: number | null,
  selectedIndex: number
) {
  const preferredIndex = hoveredIndex ?? selectedIndex;

  return clamp(preferredIndex, 0, Math.max(0, pointCount - 1));
}

export function shouldApplyWheelZoom(
  lastZoomAt: number | null,
  currentTime: number,
  minimumInterval = 110
) {
  return lastZoomAt === null || currentTime - lastZoomAt >= minimumInterval;
}

function clampWindow(start: number, end: number, domainStart: number, domainEnd: number) {
  const length = end - start;

  if (start < domainStart) {
    return { start: domainStart, end: domainStart + length };
  }

  if (end > domainEnd) {
    return { start: domainEnd - length, end: domainEnd };
  }

  return { start, end };
}

function compressBucket(bucket: ShillerPoint[], bucketSize: "quarter" | "year"): ShillerPoint {
  const first = bucket[0];
  const last = bucket[bucket.length - 1];
  const open = first.capeOhlc?.open ?? first.cape;
  const close = last.capeOhlc?.close ?? last.cape;
  const high = Math.max(...bucket.map((point) => point.capeOhlc?.high ?? point.cape));
  const low = Math.min(...bucket.map((point) => point.capeOhlc?.low ?? point.cape));

  return {
    ...last,
    cape: close,
    capeOhlc: {
      open: roundNumber(open),
      high: roundNumber(high),
      low: roundNumber(low),
      close: roundNumber(close)
    },
    source: `Compressed ${bucketSize} CAPE range`
  };
}

function bucketKey(date: string, bucketSize: "quarter" | "year") {
  const [year, month] = date.split("-").map(Number);

  if (bucketSize === "year") {
    return String(year);
  }

  const quarter = Math.floor(((month || 1) - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

function nearestPointIndexByDate(points: ShillerPoint[], date: string) {
  const target = dateToTime(date);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.abs(dateToTime(points[index].date) - target);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function addYears(date: string, years: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return timeToDate(next.getTime());
}

function dateToTime(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function timeToDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatAxisDate(date: string, span: number) {
  const day = 1000 * 60 * 60 * 24;
  const value = new Date(`${date}T00:00:00.000Z`);

  if (span <= day * 180) {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(value);
  }

  if (span <= day * 366 * 6) {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC"
    }).format(roundToNearestMonth(value));
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "UTC"
  }).format(roundToNearestYear(value));
}

function roundToNearestMonth(value: Date) {
  const monthOffset = value.getUTCDate() >= 16 ? 1 : 0;
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + monthOffset, 1));
}

function roundToNearestYear(value: Date) {
  const yearOffset = value.getUTCMonth() >= 6 ? 1 : 0;
  return new Date(Date.UTC(value.getUTCFullYear() + yearOffset, 0, 1));
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
