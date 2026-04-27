"use client";

import { useMemo, useState } from "react";
import {
  getBuffettSnapshot,
  type BuffettPoint
} from "../../lib/buffett";

type BuffettDashboardProps = {
  initialPoints: BuffettPoint[];
  worldPoints: BuffettPoint[];
  globalPoints: BuffettPoint[];
  marketValueSourceUrl: string;
  gdpSourceUrl: string;
  worldGdpSourceUrl: string;
  worldMarketValueSourceUrl: string;
  fetchedAt: string;
};

type RangeKey = "10y" | "25y" | "50y" | "all";
type ComparisonKey = "usUs" | "usWorld" | "worldWorld";

const rangeOptions: Array<{ key: RangeKey; label: string }> = [
  { key: "10y", label: "10Y" },
  { key: "25y", label: "25Y" },
  { key: "50y", label: "50Y" },
  { key: "all", label: "All" }
];

export function BuffettDashboard({
  initialPoints,
  worldPoints,
  globalPoints,
  marketValueSourceUrl,
  gdpSourceUrl,
  worldGdpSourceUrl,
  worldMarketValueSourceUrl,
  fetchedAt
}: BuffettDashboardProps) {
  const [comparison, setComparison] = useState<ComparisonKey>("usUs");
  const activePoints =
    comparison === "usUs"
      ? initialPoints
      : comparison === "usWorld"
        ? worldPoints
        : globalPoints;
  const latestPoint = activePoints[activePoints.length - 1];
  const firstPoint = activePoints[0];
  const [selectedDate, setSelectedDate] = useState(latestPoint.date);
  const [range, setRange] = useState<RangeKey>("all");
  const snapshot = useMemo(
    () => getBuffettSnapshot(activePoints, selectedDate),
    [activePoints, selectedDate]
  );
  const visiblePoints = useMemo(
    () => filterPointsByRange(activePoints, range),
    [activePoints, range]
  );
  const numeratorLabel = comparison === "worldWorld" ? "World market value" : "U.S. market value";
  const numeratorShortLabel = comparison === "worldWorld" ? "World market" : "U.S. market";
  const denominatorLabel = comparison === "usUs" ? "U.S. GDP" : "World GDP";
  const selectedGdpLabel =
    comparison !== "usUs"
      ? `${formatYear(snapshot.selected.gdpDate)} world GDP`
      : "U.S. GDP";
  const selectedPointLabel =
    comparison === "worldWorld"
      ? formatYear(snapshot.selected.date)
      : formatQuarter(snapshot.selected.date);
  const applyComparison = (nextComparison: ComparisonKey) => {
    const nextPoints =
      nextComparison === "usUs"
        ? initialPoints
        : nextComparison === "usWorld"
          ? worldPoints
          : globalPoints;
    const nextFirstDate = nextPoints[0].date;
    const nextLastDate = nextPoints[nextPoints.length - 1].date;

    setComparison(nextComparison);
    setSelectedDate((currentDate) =>
      currentDate < nextFirstDate
        ? nextFirstDate
        : currentDate > nextLastDate
          ? nextLastDate
          : currentDate
    );
  };

  return (
    <main className="shell chartShell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brandMark" aria-hidden="true" />
          Market Atlas
        </a>
        <nav aria-label="Primary navigation">
          <a href="/">Dashboard</a>
          <a href="/chart">CAPE chart</a>
          <a href="/buffett">Buffett indicator</a>
          <a href="/spx-weekdays">SPX weekdays</a>
          <a href="/#about">Data sources</a>
        </nav>
      </header>

      <section className="workbenchIntro">
        <div>
          <p className="eyebrow">Second valuation page</p>
          <h1>Buffett indicator</h1>
          <p>
            Compare U.S. or global equity market value against U.S. GDP or World
            GDP, computed from public FRED and World Bank component series.
          </p>
        </div>
        <div className="quoteStack">
          <span>{numeratorShortLabel} / {denominatorLabel}</span>
          <strong>{snapshot.selected.ratio.toFixed(0)}%</strong>
          <em>{selectedPointLabel} · {snapshot.band.label}</em>
        </div>
      </section>

      <section className="workbenchPanel panel" aria-label="Buffett indicator chart">
        <div className="workbenchHeader">
          <div>
            <p className="eyebrow">Buffett chart</p>
            <h2>{numeratorShortLabel} to {denominatorLabel}</h2>
          </div>
          <span className={`statusBadge ${snapshot.band.tone}`}>
            {snapshot.band.label}
          </span>
        </div>

        <div className="chartControls workbenchControls">
          <div className="segmented modeSegment wideSegment" aria-label="Buffett comparison">
            <button
              type="button"
              aria-pressed={comparison === "usUs"}
              onClick={() => applyComparison("usUs")}
            >
              U.S. / U.S. GDP
            </button>
            <button
              type="button"
              aria-pressed={comparison === "usWorld"}
              onClick={() => applyComparison("usWorld")}
            >
              U.S. / World GDP
            </button>
            <button
              type="button"
              aria-pressed={comparison === "worldWorld"}
              onClick={() => applyComparison("worldWorld")}
            >
              World / World GDP
            </button>
          </div>
          <div className="segmented" aria-label="Chart window">
            {rangeOptions.map((option) => (
              <button
                type="button"
                key={option.key}
                aria-pressed={range === option.key}
                onClick={() => setRange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="dateControl">
            <span>As of</span>
            <input
              type="date"
              min={firstPoint.date}
              max={latestPoint.date}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              onInput={(event) => setSelectedDate(event.currentTarget.value)}
            />
          </label>
        </div>

        <BuffettChart
          points={visiblePoints}
          selectedDate={snapshot.selected.date}
          average={snapshot.average}
          comparison={comparison}
          numeratorLabel={numeratorLabel}
          denominatorLabel={denominatorLabel}
          onSelectDate={setSelectedDate}
        />
      </section>

      <section className="chartMetaGrid" aria-label="Selected Buffett indicator details">
        <ChartStat label={numeratorLabel} value={`$${formatTrillions(snapshot.selected.marketValue)}T`} />
        <ChartStat label={denominatorLabel} value={`$${formatTrillions(snapshot.selected.gdp)}T`} />
        <ChartStat label="Ratio" value={`${snapshot.selected.ratio.toFixed(0)}%`} />
        <ChartStat label="Percentile" value={`${snapshot.percentile}%`} />
        <ChartStat label={comparison === "usUs" ? "Average" : "GDP date"} value={comparison === "usUs" ? `${snapshot.average.toFixed(0)}%` : selectedGdpLabel} />
      </section>

      <section className="sourceNote panel">
        <p className="eyebrow">Method</p>
        <p>
          The numerator is FRED series NCBEILQ027S, Nonfinancial Corporate Business
          corporate equities liability level, converted from millions to billions,
          for the U.S. market modes. The global market mode uses World Bank
          CM.MKT.LCAP.CD, Market capitalization of listed domestic companies,
          converted from current U.S. dollars to billions. The default denominator
          is FRED U.S. GDP in billions. World GDP uses annual World Bank GDP
          through FRED, converted from current U.S. dollars to billions.
        </p>
        <p className="sourceLine">
          Source fetched {formatDateTime(fetchedAt)} from{" "}
          <a href={marketValueSourceUrl}>FRED equity market value</a>
          {", "}<a href={gdpSourceUrl}>FRED U.S. GDP</a>
          {", "}<a href={worldGdpSourceUrl}>FRED World GDP</a>
          {" "}and <a href={worldMarketValueSourceUrl}>World Bank world market cap</a>.
        </p>
      </section>
    </main>
  );
}

function BuffettChart({
  points,
  selectedDate,
  average,
  comparison,
  numeratorLabel,
  denominatorLabel,
  onSelectDate
}: {
  points: BuffettPoint[];
  selectedDate: string;
  average: number;
  comparison: ComparisonKey;
  numeratorLabel: string;
  denominatorLabel: string;
  onSelectDate: (date: string) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return null;
  }

  const width = 1120;
  const height = 500;
  const padding = { top: 40, right: 30, bottom: 52, left: 58 };
  const selectedIndex = nearestIndex(points, selectedDate);
  const activeIndex = hoveredIndex ?? selectedIndex;
  const active = points[activeIndex];
  const min = 0;
  const max = Math.ceil(Math.max(...points.map((point) => point.ratio), average) / 50) * 50;
  const path = buildLinePath(points, width, height, padding, min, max);
  const activeX = xForDate(active.date, points, width, padding);
  const activeY = yForValue(active.ratio, height, padding, min, max);
  const yTicks = buildValueTicks(max);
  const dateTicks = buildDateTicks(points, 5);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const selectedPointFromEvent = (clientX: number, rect: DOMRect) => {
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const ratio = clamp((svgX - padding.left) / plotWidth, 0, 1);
    const targetDate = dateForRatio(ratio, points[0].date, points[points.length - 1].date);
    return points[nearestIndex(points, targetDate)];
  };

  return (
    <div className="chartWrap">
      <div className="chartReadout" aria-live="polite">
        <strong>{formatPointLabel(active.date, comparison)}</strong>
        <span>{active.ratio.toFixed(1)}% · {numeratorLabel} ${formatTrillions(active.marketValue)}T · {denominatorLabel} ${formatTrillions(active.gdp)}T</span>
      </div>
      <svg
        className="chart largeChart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Buffett indicator chart for ${numeratorLabel} versus ${denominatorLabel}. Selected ${formatPointLabel(active.date, comparison)} at ${active.ratio.toFixed(1)} percent.`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onSelectDate(selectedPointFromEvent(event.clientX, rect).date);
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const hoveredPoint = selectedPointFromEvent(event.clientX, rect);
          setHoveredIndex(nearestIndex(points, hoveredPoint.date));
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id="buffettFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4267c6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#4267c6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x={padding.left}
          y={padding.top}
          width={plotWidth}
          height={plotHeight}
          className="plotFrame"
        />
        <rect
          x={padding.left}
          y={yForValue(160, height, padding, min, max)}
          width={plotWidth}
          height={Math.max(0, yForValue(120, height, padding, min, max) - yForValue(160, height, padding, min, max))}
          className="chartBand expensive"
        />
        <rect
          x={padding.left}
          y={yForValue(120, height, padding, min, max)}
          width={plotWidth}
          height={Math.max(0, yForValue(80, height, padding, min, max) - yForValue(120, height, padding, min, max))}
          className="chartBand fair"
        />
        {yTicks.map((level) => (
          <g key={level}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yForValue(level, height, padding, min, max)}
              y2={yForValue(level, height, padding, min, max)}
              className="gridLine"
            />
            <text
              x={padding.left - 12}
              y={yForValue(level, height, padding, min, max) + 4}
              className="axisLabel"
              textAnchor="end"
            >
              {level}%
            </text>
          </g>
        ))}
        {dateTicks.map((tick) => (
          <g key={tick.date}>
            <line
              x1={xForDate(tick.date, points, width, padding)}
              x2={xForDate(tick.date, points, width, padding)}
              y1={padding.top}
              y2={height - padding.bottom}
              className="verticalGridLine"
            />
            <text
              x={xForDate(tick.date, points, width, padding)}
              y={height - 10}
              className="axisLabel"
              textAnchor="middle"
            >
              {tick.label}
            </text>
          </g>
        ))}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={yForValue(average, height, padding, min, max)}
          y2={yForValue(average, height, padding, min, max)}
          className="averageLine"
        />
        <path
          d={`${path} L ${width - padding.right} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`}
          fill="url(#buffettFill)"
        />
        <path d={path} className="buffettLine" fill="none" />
        <line
          x1={activeX}
          x2={activeX}
          y1={padding.top}
          y2={height - padding.bottom}
          className="selectedLine"
        />
        <circle cx={activeX} cy={activeY} r="7" className="selectedDot" />
      </svg>
    </div>
  );
}

function ChartStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel chartStat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function filterPointsByRange(points: BuffettPoint[], range: RangeKey) {
  if (range === "all" || points.length === 0) {
    return points;
  }

  const years = range === "10y" ? 10 : range === "25y" ? 25 : 50;
  const cutoff = addYears(points[points.length - 1].date, -years);
  return points.filter((point) => point.date >= cutoff);
}

function buildLinePath(
  points: BuffettPoint[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  min: number,
  max: number
) {
  return points
    .map((point, index) => {
      const x = xForDate(point.date, points, width, padding);
      const y = yForValue(point.ratio, height, padding, min, max);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function xForDate(
  date: string,
  points: BuffettPoint[],
  width: number,
  padding: { right: number; left: number }
) {
  const ratio = dateRatio(date, points[0].date, points[points.length - 1].date);
  return padding.left + ratio * (width - padding.left - padding.right);
}

function yForValue(
  value: number,
  height: number,
  padding: { top: number; bottom: number },
  min: number,
  max: number
) {
  const chartHeight = height - padding.top - padding.bottom;
  const ratio = (value - min) / (max - min || 1);
  return height - padding.bottom - ratio * chartHeight;
}

function buildValueTicks(max: number) {
  const ticks: number[] = [];

  for (let value = 0; value <= max; value += 50) {
    ticks.push(value);
  }

  return ticks;
}

function buildDateTicks(points: BuffettPoint[], count: number) {
  const start = dateToTime(points[0].date);
  const end = dateToTime(points[points.length - 1].date);
  const span = end - start;

  if (points.length === 1 || count <= 1) {
    return [{ date: points[0].date, label: formatYear(points[0].date) }];
  }

  return Array.from({ length: count }, (_, index) => {
    const date = timeToDate(start + span * (index / (count - 1)));
    return {
      date,
      label: formatYear(date)
    };
  }).filter(
    (tick, index, ticks) =>
      ticks.findIndex((candidate) => candidate.label === tick.label) === index
  );
}

function nearestIndex(points: BuffettPoint[], date: string) {
  const target = dateToTime(date);
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.abs(dateToTime(points[index].date) - target);

    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }

  return closestIndex;
}

function dateRatio(date: string, startDate: string, endDate: string) {
  const start = dateToTime(startDate);
  const end = dateToTime(endDate);

  if (end <= start) {
    return 0;
  }

  return clamp((dateToTime(date) - start) / (end - start), 0, 1);
}

function dateForRatio(ratio: number, startDate: string, endDate: string) {
  const start = dateToTime(startDate);
  const end = dateToTime(endDate);
  return timeToDate(start + (end - start) * ratio);
}

function addYears(date: string, years: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString().slice(0, 10);
}

function dateToTime(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function timeToDate(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

function formatQuarter(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const quarter = Math.floor(value.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${value.getUTCFullYear()}`;
}

function formatPointLabel(date: string, comparison: ComparisonKey) {
  return comparison === "worldWorld" ? formatYear(date) : formatQuarter(date);
}

function formatYear(date: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatTrillions(valueInBillions: number) {
  return (valueInBillions / 1000).toFixed(1);
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(date));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
