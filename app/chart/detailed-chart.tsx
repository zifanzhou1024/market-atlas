"use client";

import { useMemo, useState } from "react";
import {
  compressChartPoints,
  filterPointsByWindow,
  getDateWindowForPreset,
  panDateWindow,
  zoomDateWindow,
  type ChartPreset
} from "../../lib/chart-viewport";
import { formatDateTime, formatDay, formatMonth, formatYear } from "../../lib/format";
import {
  buildForwardPeComparisonPoints,
  type ForwardPeComparisonPoint
} from "../../lib/forward-pe";
import { getDashboardSnapshot } from "../../lib/market-metrics";
import type { ShillerPoint } from "../../lib/shiller";
import {
  getCapeBounds,
  ValuationChart,
  type ChartMode
} from "../valuation-chart";
import { withBasePath } from "../../lib/paths";

type DetailedChartProps = {
  initialPoints: ShillerPoint[];
  sourceUrl: string;
  dailySourceUrl: string | null;
  ohlcSourceUrl: string | null;
  fetchedAt: string;
};

type RangeKey = ChartPreset;
type ActivePreset = RangeKey | "custom";

const rangeOptions: Array<{ key: RangeKey; label: string }> = [
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
  { key: "25y", label: "25Y" },
  { key: "50y", label: "50Y" },
  { key: "all", label: "All" }
];

export function DetailedChart({
  initialPoints,
  sourceUrl,
  dailySourceUrl,
  ohlcSourceUrl,
  fetchedAt
}: DetailedChartProps) {
  const latestPoint = initialPoints[initialPoints.length - 1];
  const firstPoint = initialPoints[0];
  const forwardPePoints = useMemo(
    () => buildForwardPeComparisonPoints(initialPoints),
    [initialPoints]
  );
  const firstForwardPePoint = forwardPePoints[0];
  const latestForwardPePoint = forwardPePoints[forwardPePoints.length - 1];
  const [selectedDate, setSelectedDate] = useState(latestPoint.date);
  const [selectedForwardPeDate, setSelectedForwardPeDate] = useState(
    latestForwardPePoint?.date ?? latestPoint.date
  );
  const [activePreset, setActivePreset] = useState<ActivePreset>("1y");
  const [forwardPeRange, setForwardPeRange] = useState<RangeKey>("25y");
  const [chartMode, setChartMode] = useState<ChartMode>("candles");
  const [viewport, setViewport] = useState(() =>
    getDateWindowForPreset(initialPoints, "1y")
  );
  const snapshot = useMemo(
    () => getDashboardSnapshot(initialPoints, selectedDate),
    [initialPoints, selectedDate]
  );
  const visiblePoints = useMemo(() => {
    const windowedPoints = filterPointsByWindow(initialPoints, viewport);
    return compressChartPoints(windowedPoints.length > 0 ? windowedPoints : initialPoints);
  }, [initialPoints, viewport]);
  const visibleBounds = useMemo(
    () => getCapeBounds(visiblePoints, chartMode),
    [visiblePoints, chartMode]
  );
  const visibleForwardPePoints = useMemo(() => {
    const rangedPoints = filterForwardPePointsByRange(forwardPePoints, forwardPeRange);
    return rangedPoints.length > 0 ? rangedPoints : forwardPePoints;
  }, [forwardPePoints, forwardPeRange]);
  const selectedForwardPePoint = forwardPePoints.length > 0
    ? forwardPePoints[nearestForwardPeIndex(forwardPePoints, selectedForwardPeDate)]
    : null;
  const candleCount = visiblePoints.filter((point) => point.capeOhlc).length;
  const selectedCandle = snapshot.selected.capeOhlc;
  const applyPreset = (preset: RangeKey) => {
    setActivePreset(preset);
    setViewport(getDateWindowForPreset(initialPoints, preset));
  };
  const applyZoom = (direction: "in" | "out", anchorDate = selectedDate) => {
    setActivePreset("custom");
    setViewport((currentWindow) =>
      zoomDateWindow(initialPoints, currentWindow, direction, anchorDate)
    );
  };
  const applyPan = (deltaRatio: number) => {
    setActivePreset("custom");
    setViewport((currentWindow) =>
      panDateWindow(initialPoints, currentWindow, deltaRatio)
    );
  };
  const resetZoom = () => applyPreset("1y");
  const handleDateInput = (value: string) => setSelectedDate(value);

  return (
    <main className="shell chartShell">
      <header className="topbar">
        <a className="brand" href={withBasePath("/")}>
          <span className="brandMark" aria-hidden="true" />
          Market Atlas
        </a>
        <nav aria-label="Primary navigation">
          <a href={withBasePath("/")}>Dashboard</a>
          <a href={withBasePath("/chart")} aria-current="page">Detailed chart</a>
          <a href={withBasePath("/buffett")}>Buffett indicator</a>
          <a href={withBasePath("/spx-weekdays")}>SPX weekdays</a>
          <a href={withBasePath("/data")}>Data status</a>
        </nav>
      </header>

      <section className="workbenchIntro">
        <div>
          <p className="eyebrow">Detailed chart</p>
          <h1>Shiller PE technical view</h1>
          <p>
            Zoom the valuation series, switch between the computed close line and CAPE candles,
            and inspect the last year day by day.
          </p>
        </div>
        <div className="quoteStack">
          <span>Selected CAPE</span>
          <strong>{snapshot.selected.cape.toFixed(2)}</strong>
          <em>{formatPointDate(snapshot.selected)} · {snapshot.band.label}</em>
        </div>
      </section>

      <section className="workbenchPanel panel" aria-label="Detailed Shiller PE chart">
        <div className="workbenchHeader">
          <div>
            <p className="eyebrow">CAPE chart</p>
            <h2>{chartMode === "candles" ? "Candles" : "Close line"}</h2>
          </div>
          <div className="chartLegend" aria-label="Legend">
            <span className="legendItem up">Up candle</span>
            <span className="legendItem down">Down candle</span>
            <span className="legendItem line">Computed close</span>
          </div>
        </div>

        <div className="chartControls workbenchControls">
          <div className="segmented" aria-label="Chart window">
            {rangeOptions.map((option) => (
              <button
                type="button"
                key={option.key}
                aria-pressed={activePreset === option.key}
                onClick={() => applyPreset(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="segmented modeSegment" aria-label="Chart style">
            <button
              type="button"
              aria-pressed={chartMode === "line"}
              onClick={() => setChartMode("line")}
            >
              Line
            </button>
            <button
              type="button"
              aria-pressed={chartMode === "candles"}
              onClick={() => setChartMode("candles")}
            >
              Candles
            </button>
          </div>
          <div className="zoomControls" aria-label="Zoom controls">
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => applyZoom("out")}>
              -
            </button>
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => applyZoom("in")}>
              +
            </button>
            <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={resetZoom}>
              Reset
            </button>
          </div>
          <label className="dateControl">
            <span>As of</span>
            <input
              type="date"
              min={firstPoint.date}
              max={latestPoint.date}
              value={selectedDate}
              onChange={(event) => handleDateInput(event.target.value)}
              onInput={(event) => handleDateInput(event.currentTarget.value)}
            />
          </label>
        </div>

        <ValuationChart
          points={visiblePoints}
          selectedDate={snapshot.selected.date}
          onSelectDate={setSelectedDate}
          onZoom={applyZoom}
          onPan={applyPan}
          dateWindow={viewport}
          min={visibleBounds.min}
          max={visibleBounds.max}
          mode={chartMode}
          variant="large"
        />
      </section>

      <section className="chartMetaGrid" aria-label="Selected candle details">
        <ChartStat label="Open" value={formatCandleValue(selectedCandle?.open)} />
        <ChartStat label="High" value={formatCandleValue(selectedCandle?.high)} />
        <ChartStat label="Low" value={formatCandleValue(selectedCandle?.low)} />
        <ChartStat label="Close" value={snapshot.selected.cape.toFixed(2)} />
        <ChartStat label="Visible candles" value={String(candleCount)} />
      </section>

      {forwardPePoints.length > 0 ? (
        <>
          <section className="workbenchPanel panel" aria-label="Forward PE versus SPX price chart">
            <div className="workbenchHeader">
              <div>
                <p className="eyebrow">Forward PE comparison</p>
                <h2>Forward PE vs SPX price</h2>
              </div>
              <div className="chartLegend" aria-label="Legend">
                <span className="legendItem forwardPe">Forward PE</span>
                <span className="legendItem price">SPX price</span>
              </div>
            </div>

            <div className="chartControls workbenchControls">
              <div className="segmented" aria-label="Forward PE chart window">
                {rangeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    aria-pressed={forwardPeRange === option.key}
                    onClick={() => setForwardPeRange(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="dateControl">
                <span>As of</span>
                <input
                  type="date"
                  min={firstForwardPePoint.date}
                  max={latestForwardPePoint.date}
                  value={selectedForwardPeDate}
                  onChange={(event) => setSelectedForwardPeDate(event.target.value)}
                  onInput={(event) => setSelectedForwardPeDate(event.currentTarget.value)}
                />
              </label>
            </div>

            <ForwardPeComparisonChart
              points={visibleForwardPePoints}
              selectedDate={selectedForwardPeDate}
              onSelectDate={setSelectedForwardPeDate}
            />
          </section>

          <section className="chartMetaGrid" aria-label="Selected forward PE comparison details">
            <ChartStat
              label="Forward PE"
              value={selectedForwardPePoint ? selectedForwardPePoint.forwardPe.toFixed(2) : "n/a"}
            />
            <ChartStat
              label="SPX price"
              value={selectedForwardPePoint ? formatNumber(selectedForwardPePoint.price) : "n/a"}
            />
            <ChartStat
              label="Forward earnings"
              value={selectedForwardPePoint ? formatNumber(selectedForwardPePoint.forwardEarnings) : "n/a"}
            />
            <ChartStat
              label="Earnings date"
              value={selectedForwardPePoint ? formatPointDateLike(selectedForwardPePoint.forwardEarningsDate) : "n/a"}
            />
            <ChartStat label="Visible points" value={String(visibleForwardPePoints.length)} />
          </section>
        </>
      ) : null}

      <section className="sourceNote panel">
        <p className="eyebrow">Method</p>
        <p>
          The close line remains the computed CAPE value from Shiller components and FRED S&P 500 closes.
          Candle bodies use Nasdaq SPY daily OHLC as a same-day range proxy, scaled to the FRED S&P 500 close,
          then divided by the same 10-year real earnings denominator.
          The forward PE comparison divides each date's SPX price by the first available Shiller earnings value at
          least 12 months later, so it is a realized one-year-ahead multiple rather than a consensus analyst estimate.
        </p>
        <p className="sourceLine">
          Source fetched {formatDateTime(fetchedAt)} from{" "}
          <a href={sourceUrl}>{sourceLabel(sourceUrl)}</a>
          {dailySourceUrl ? (
            <>
              {" "}and <a href={dailySourceUrl}>FRED daily S&P 500</a>
            </>
          ) : null}
          {ohlcSourceUrl ? (
            <>
              {" "}with <a href={ohlcSourceUrl}>Nasdaq SPY OHLC</a>.
            </>
          ) : (
            "."
          )}
        </p>
      </section>
    </main>
  );
}

function ForwardPeComparisonChart({
  points,
  selectedDate,
  onSelectDate
}: {
  points: ForwardPeComparisonPoint[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return null;
  }

  const width = 1120;
  const height = 500;
  const padding = { top: 40, right: 76, bottom: 52, left: 58 };
  const selectedIndex = nearestForwardPeIndex(points, selectedDate);
  const activeIndex = hoveredIndex ?? selectedIndex;
  const active = points[activeIndex];
  const peBounds = buildAxisBounds(points.map((point) => point.forwardPe), 5);
  const priceBounds = buildAxisBounds(points.map((point) => point.price), 500);
  const forwardPePath = buildComparisonLinePath(
    points,
    (point) => point.forwardPe,
    width,
    height,
    padding,
    peBounds.min,
    peBounds.max
  );
  const pricePath = buildComparisonLinePath(
    points,
    (point) => point.price,
    width,
    height,
    padding,
    priceBounds.min,
    priceBounds.max
  );
  const activeX = xForComparisonDate(active.date, points, width, padding);
  const activeY = yForComparisonValue(active.forwardPe, height, padding, peBounds.min, peBounds.max);
  const peTicks = buildValueTicks(peBounds.min, peBounds.max, 5);
  const priceTicks = buildValueTicks(priceBounds.min, priceBounds.max, 5);
  const dateTicks = buildComparisonDateTicks(points, 5);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const selectedPointFromEvent = (clientX: number, rect: DOMRect) => {
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const ratio = clamp((svgX - padding.left) / plotWidth, 0, 1);
    const targetDate = dateForRatio(ratio, points[0].date, points[points.length - 1].date);
    return points[nearestForwardPeIndex(points, targetDate)];
  };

  return (
    <div className="chartWrap">
      <div className="chartReadout" aria-live="polite">
        <strong>{formatPointDateLike(active.date)}</strong>
        <span>
          Forward PE {active.forwardPe.toFixed(2)} · SPX {formatNumber(active.price)} · earnings {formatNumber(active.forwardEarnings)}
        </span>
      </div>
      <svg
        className="chart largeChart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Forward PE versus SPX price chart. Selected ${formatPointDateLike(active.date)} at ${active.forwardPe.toFixed(2)} forward PE and ${formatNumber(active.price)} SPX.`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onSelectDate(selectedPointFromEvent(event.clientX, rect).date);
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const hoveredPoint = selectedPointFromEvent(event.clientX, rect);
          setHoveredIndex(nearestForwardPeIndex(points, hoveredPoint.date));
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <rect
          x={padding.left}
          y={padding.top}
          width={plotWidth}
          height={plotHeight}
          className="plotFrame"
        />
        {peTicks.map((level) => (
          <g key={`pe-${level}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yForComparisonValue(level, height, padding, peBounds.min, peBounds.max)}
              y2={yForComparisonValue(level, height, padding, peBounds.min, peBounds.max)}
              className="gridLine"
            />
            <text
              x={padding.left - 12}
              y={yForComparisonValue(level, height, padding, peBounds.min, peBounds.max) + 4}
              className="axisLabel"
              textAnchor="end"
            >
              {level.toFixed(0)}x
            </text>
          </g>
        ))}
        {priceTicks.map((level) => (
          <text
            key={`price-${level}`}
            x={width - padding.right + 12}
            y={yForComparisonValue(level, height, padding, priceBounds.min, priceBounds.max) + 4}
            className="axisLabel rightAxisLabel"
            textAnchor="start"
          >
            {formatCompactNumber(level)}
          </text>
        ))}
        {dateTicks.map((tick) => (
          <g key={tick.date}>
            <line
              x1={xForComparisonDate(tick.date, points, width, padding)}
              x2={xForComparisonDate(tick.date, points, width, padding)}
              y1={padding.top}
              y2={height - padding.bottom}
              className="verticalGridLine"
            />
            <text
              x={xForComparisonDate(tick.date, points, width, padding)}
              y={height - 10}
              className="axisLabel"
              textAnchor="middle"
            >
              {tick.label}
            </text>
          </g>
        ))}
        <path d={pricePath} className="spxPriceLine" fill="none" />
        <path d={forwardPePath} className="forwardPeLine" fill="none" />
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

function formatCandleValue(value: number | undefined) {
  return value === undefined ? "n/a" : value.toFixed(2);
}

function filterForwardPePointsByRange(
  points: ForwardPeComparisonPoint[],
  range: RangeKey
) {
  if (range === "all" || points.length === 0) {
    return points;
  }

  const years =
    range === "1y" ? 1 : range === "5y" ? 5 : range === "25y" ? 25 : 50;
  const cutoff = addYears(points[points.length - 1].date, -years);
  return points.filter((point) => point.date >= cutoff);
}

function buildComparisonLinePath(
  points: ForwardPeComparisonPoint[],
  getValue: (point: ForwardPeComparisonPoint) => number,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  min: number,
  max: number
) {
  return points
    .map((point, index) => {
      const x = xForComparisonDate(point.date, points, width, padding);
      const y = yForComparisonValue(getValue(point), height, padding, min, max);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function xForComparisonDate(
  date: string,
  points: ForwardPeComparisonPoint[],
  width: number,
  padding: { right: number; left: number }
) {
  const ratio = dateRatio(date, points[0].date, points[points.length - 1].date);
  return padding.left + ratio * (width - padding.left - padding.right);
}

function yForComparisonValue(
  value: number,
  height: number,
  padding: { top: number; bottom: number },
  min: number,
  max: number
) {
  const chartHeight = height - padding.top - padding.bottom;
  const ratio = (value - min) / (max - min || 1);
  return height - padding.bottom - clamp(ratio, 0, 1) * chartHeight;
}

function buildAxisBounds(values: number[], increment: number) {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  let min = Math.max(0, Math.floor(minValue / increment) * increment);
  let max = Math.ceil(maxValue / increment) * increment;

  if (min === max) {
    min = Math.max(0, min - increment);
    max += increment;
  }

  return { min, max };
}

function buildValueTicks(min: number, max: number, count: number) {
  if (count <= 1) {
    return [min];
  }

  return Array.from({ length: count }, (_, index) =>
    Math.round(min + ((max - min) * index) / (count - 1))
  ).filter((value, index, values) => values.indexOf(value) === index);
}

function buildComparisonDateTicks(points: ForwardPeComparisonPoint[], count: number) {
  const start = dateToTime(points[0].date);
  const end = dateToTime(points[points.length - 1].date);
  const span = end - start;

  if (points.length === 1 || count <= 1) {
    return [{ date: points[0].date, label: formatPointDateLike(points[0].date) }];
  }

  return Array.from({ length: count }, (_, index) => {
    const date = timeToDate(start + span * (index / (count - 1)));
    return {
      date,
      label: span <= 1000 * 60 * 60 * 24 * 366 * 6
        ? formatShortDate(date)
        : formatYear(date)
    };
  }).filter(
    (tick, index, ticks) =>
      ticks.findIndex((candidate) => candidate.label === tick.label) === index
  );
}

function nearestForwardPeIndex(points: ForwardPeComparisonPoint[], date: string) {
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

function formatPointDate(point: ShillerPoint) {
  return point.frequency === "daily" ? formatDay(point.date) : formatMonth(point.date);
}

function formatPointDateLike(date: string) {
  return date.endsWith("-01") ? formatMonth(date) : formatDay(date);
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function dateToTime(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function timeToDate(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sourceLabel(sourceUrl: string) {
  return sourceUrl.includes("wsimg") ? "shillerdata.com workbook" : "Yale workbook";
}
