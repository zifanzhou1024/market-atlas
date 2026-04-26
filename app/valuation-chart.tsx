"use client";

import { useRef, useState } from "react";
import {
  buildDateTicks,
  dateToChartRatio,
  resolveChartIndex,
  shouldApplyWheelZoom,
  type DateWindow
} from "../lib/chart-viewport";
import type { Ohlc, ShillerPoint } from "../lib/shiller";

export type ChartMode = "line" | "candles";

type ChartVariant = "compact" | "large";

type ValuationChartProps = {
  points: ShillerPoint[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onZoom: (direction: "in" | "out", anchorDate: string) => void;
  onPan: (deltaRatio: number) => void;
  dateWindow: DateWindow;
  min: number;
  max: number;
  mode: ChartMode;
  variant?: ChartVariant;
};

export function getCapeBounds(points: ShillerPoint[], mode: ChartMode) {
  const values = points.flatMap((point) =>
    mode === "candles" && point.capeOhlc
      ? [point.capeOhlc.low, point.capeOhlc.high, point.cape]
      : [point.cape]
  );

  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

export function ValuationChart({
  points,
  selectedDate,
  onSelectDate,
  onZoom,
  onPan,
  dateWindow,
  min,
  max,
  mode,
  variant = "compact"
}: ValuationChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const lastWheelZoomAt = useRef<number | null>(null);
  const dragState = useRef<{
    lastX: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const ignoreNextClick = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  if (points.length === 0) {
    return null;
  }

  const width = variant === "large" ? 1120 : 920;
  const height = variant === "large" ? 520 : 420;
  const padding = {
    top: variant === "large" ? 42 : 34,
    right: 26,
    bottom: 48,
    left: 54
  };
  const selectedIndex = nearestIndex(points, selectedDate);
  const activeIndex = resolveChartIndex(points.length, hoveredIndex, selectedIndex);
  const selected = points[selectedIndex];
  const active = points[activeIndex];
  const path = buildLinePath(points, dateWindow, width, height, padding, min, max);
  const activeX = xForDate(active.date, dateWindow, width, padding);
  const activeY = yForValue(active.cape, height, padding, min, max);
  const ticks = buildTicks(min, max);
  const dateTicks = buildDateTicks(points, 5, dateWindow);
  const plotWidth = width - padding.left - padding.right;
  const candleWidth = Math.max(2, Math.min(9, (plotWidth / points.length) * 0.64));
  const getPointForClientX = (clientX: number, rect: DOMRect) => {
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const plotRatio = clamp((svgX - padding.left) / plotWidth, 0, 1);
    const targetDate = dateForRatio(plotRatio, dateWindow);
    const index = nearestIndex(points, targetDate);

    return {
      index,
      point: points[index]
    };
  };

  return (
    <div className={`chartWrap ${isPanning ? "panning" : ""}`}>
      <div className="chartReadout" aria-live="polite">
        <strong>{formatPointDate(active)}</strong>
        <span>{formatReadout(active, mode)}</span>
      </div>
    <svg
      className={`chart ${variant === "large" ? "largeChart" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Shiller PE ${mode} chart. Selected ${formatPointDate(selected)} at ${selected.cape.toFixed(1)}.`}
      onClick={(event) => {
        if (ignoreNextClick.current) {
          ignoreNextClick.current = false;
          return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const { point } = getPointForClientX(event.clientX, rect);
        onSelectDate(point.date);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        dragState.current = {
          lastX: event.clientX,
          moved: false,
          pointerId: event.pointerId
        };
        setIsPanning(true);
      }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const { index } = getPointForClientX(event.clientX, rect);
        setHoveredIndex(index);

        if (!dragState.current) {
          return;
        }

        const deltaX = event.clientX - dragState.current.lastX;

        if (Math.abs(deltaX) < 3) {
          return;
        }

        dragState.current.lastX = event.clientX;
        dragState.current.moved = true;
        onPan(-(deltaX / rect.width));
      }}
      onPointerUp={(event) => {
        if (dragState.current?.pointerId === event.pointerId) {
          ignoreNextClick.current = dragState.current.moved;
          dragState.current = null;
          setIsPanning(false);
        }
      }}
      onPointerCancel={() => {
        dragState.current = null;
        setIsPanning(false);
      }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const { index } = getPointForClientX(event.clientX, rect);
        setHoveredIndex(index);
      }}
      onMouseLeave={() => setHoveredIndex(null)}
      onWheel={(event) => {
        event.preventDefault();
        const currentTime = Date.now();

        if (!shouldApplyWheelZoom(lastWheelZoomAt.current, currentTime)) {
          return;
        }

        lastWheelZoomAt.current = currentTime;
        const rect = event.currentTarget.getBoundingClientRect();
        const { point } = getPointForClientX(event.clientX, rect);
        onZoom(event.deltaY > 0 ? "out" : "in", point.date);
      }}
    >
      <defs>
        <linearGradient id={`chartFill-${variant}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2f7d74" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2f7d74" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect
        x={padding.left}
        y={padding.top}
        width={plotWidth}
        height={height - padding.top - padding.bottom}
        className="plotFrame"
      />
      <rect
        x={padding.left}
        y={yForValue(40, height, padding, min, max)}
        width={plotWidth}
        height={Math.max(0, yForValue(28, height, padding, min, max) - yForValue(40, height, padding, min, max))}
        className="chartBand expensive"
      />
      <rect
        x={padding.left}
        y={yForValue(28, height, padding, min, max)}
        width={plotWidth}
        height={Math.max(0, yForValue(18, height, padding, min, max) - yForValue(28, height, padding, min, max))}
        className="chartBand fair"
      />
      {ticks.map((level) => (
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
            {level}
          </text>
        </g>
      ))}
      {dateTicks.map((tick) => (
        <g key={`${tick.date}-${tick.label}`}>
          <line
            x1={xForDate(tick.date, dateWindow, width, padding)}
            x2={xForDate(tick.date, dateWindow, width, padding)}
            y1={padding.top}
            y2={height - padding.bottom}
            className="verticalGridLine"
          />
          <text
            x={xForDate(tick.date, dateWindow, width, padding)}
            y={height - 8}
            className="axisLabel"
            textAnchor="middle"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {mode === "line" ? (
        <path
          d={`${path} L ${width - padding.right} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`}
          fill={`url(#chartFill-${variant})`}
        />
      ) : null}
      <path d={path} className={`capeLine ${mode === "candles" ? "closeLine" : ""}`} fill="none" />
      {mode === "candles"
        ? points.map((point) => {
            if (!point.capeOhlc) {
              return null;
            }

            return (
              <Candle
                key={point.date}
                ohlc={point.capeOhlc}
                x={xForDate(point.date, dateWindow, width, padding)}
                width={candleWidth}
                height={height}
                padding={padding}
                min={min}
                max={max}
              />
            );
          })
        : null}
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

function Candle({
  ohlc,
  x,
  width,
  height,
  padding,
  min,
  max
}: {
  ohlc: Ohlc;
  x: number;
  width: number;
  height: number;
  padding: { top: number; bottom: number };
  min: number;
  max: number;
}) {
  const openY = yForValue(ohlc.open, height, padding, min, max);
  const closeY = yForValue(ohlc.close, height, padding, min, max);
  const highY = yForValue(ohlc.high, height, padding, min, max);
  const lowY = yForValue(ohlc.low, height, padding, min, max);
  const isUp = ohlc.close >= ohlc.open;
  const bodyY = Math.min(openY, closeY);
  const bodyHeight = Math.max(2, Math.abs(closeY - openY));

  return (
    <g className={`candle ${isUp ? "up" : "down"}`}>
      <line x1={x} x2={x} y1={highY} y2={lowY} className="candleWick" />
      <rect
        x={x - width / 2}
        y={bodyY}
        width={width}
        height={bodyHeight}
        rx="1.5"
        className="candleBody"
      />
    </g>
  );
}

function buildLinePath(
  points: ShillerPoint[],
  dateWindow: DateWindow,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  min: number,
  max: number
) {
  return points
    .map((point, index) => {
      const x = xForDate(point.date, dateWindow, width, padding);
      const y = yForValue(point.cape, height, padding, min, max);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function xForDate(
  date: string,
  dateWindow: DateWindow,
  width: number,
  padding: { right: number; left: number }
) {
  return padding.left + dateToChartRatio(date, dateWindow) * (width - padding.left - padding.right);
}

function yForValue(
  value: number,
  height: number,
  padding: { top: number; bottom: number },
  min: number,
  max: number
) {
  const chartHeight = height - padding.top - padding.bottom;
  const buffer = Math.max(2, (max - min) * 0.08);
  const adjustedMin = Math.max(0, min - buffer);
  const adjustedMax = max + buffer;
  const ratio = (value - adjustedMin) / (adjustedMax - adjustedMin || 1);
  return height - padding.bottom - ratio * chartHeight;
}

function nearestIndex(points: ShillerPoint[], date: string) {
  const targetTime = dateToTime(date);

  if (!Number.isFinite(targetTime)) {
    return 0;
  }

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.abs(dateToTime(points[index].date) - targetTime);

    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }

  return closestIndex;
}

function buildTicks(min: number, max: number) {
  const start = Math.max(0, Math.floor(min / 10) * 10);
  const end = Math.ceil(max / 10) * 10;
  const ticks: number[] = [];

  for (let value = start; value <= end; value += 10) {
    ticks.push(value);
  }

  return ticks.length > 0 ? ticks : [20, 30, 40];
}

function formatPointDate(point: ShillerPoint) {
  return point.frequency === "daily" ? formatDay(point.date) : formatMonth(point.date);
}

function formatReadout(point: ShillerPoint, mode: ChartMode) {
  if (mode === "candles" && point.capeOhlc) {
    return `O ${point.capeOhlc.open.toFixed(2)} H ${point.capeOhlc.high.toFixed(2)} L ${point.capeOhlc.low.toFixed(2)} C ${point.capeOhlc.close.toFixed(2)}`;
  }

  return `CAPE ${point.cape.toFixed(2)} · ${point.frequency === "daily" ? "daily" : "monthly"}`;
}

function formatMonth(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function dateForRatio(ratio: number, dateWindow: DateWindow) {
  if (!dateWindow.startDate || !dateWindow.endDate) {
    return dateWindow.startDate || dateWindow.endDate || "";
  }

  const start = dateToTime(dateWindow.startDate);
  const end = dateToTime(dateWindow.endDate);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return dateWindow.startDate;
  }

  return timeToDate(start + (end - start) * clamp(ratio, 0, 1));
}

function dateToTime(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function timeToDate(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
