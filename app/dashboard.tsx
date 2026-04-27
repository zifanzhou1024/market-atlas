"use client";

import { useMemo, useState } from "react";
import {
  compressChartPoints,
  filterPointsByWindow,
  getDateWindowForPreset,
  panDateWindow,
  zoomDateWindow,
  type ChartPreset
} from "../lib/chart-viewport";
import type { ShillerPoint } from "../lib/shiller";
import { getDashboardSnapshot } from "../lib/market-metrics";
import {
  getCapeBounds,
  ValuationChart,
  type ChartMode
} from "./valuation-chart";
import { withBasePath } from "../lib/paths";

type DashboardProps = {
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
  { key: "5y", label: "5Y daily" },
  { key: "25y", label: "25Y" },
  { key: "50y", label: "50Y" },
  { key: "all", label: "All" }
];

export function Dashboard({
  initialPoints,
  sourceUrl,
  dailySourceUrl,
  ohlcSourceUrl,
  fetchedAt
}: DashboardProps) {
  const [selectedDate, setSelectedDate] = useState(
    initialPoints[initialPoints.length - 1].date
  );
  const [activePreset, setActivePreset] = useState<ActivePreset>("5y");
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [viewport, setViewport] = useState(() =>
    getDateWindowForPreset(initialPoints, "5y")
  );
  const handleDateInput = (value: string) => setSelectedDate(value);

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
  const resetZoom = () => applyPreset("5y");

  const firstPoint = initialPoints[0];
  const latestPoint = initialPoints[initialPoints.length - 1];
  const latestSourceDate = formatPointDate(latestPoint);

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href={withBasePath("/")}>
          <span className="brandMark" aria-hidden="true" />
          Market Atlas
        </a>
        <nav aria-label="Primary navigation">
          <a href="#dashboard">Dashboard</a>
          <a href={withBasePath("/chart")}>Detailed chart</a>
          <a href={withBasePath("/buffett")}>Buffett indicator</a>
          <a href={withBasePath("/spx-weekdays")}>SPX weekdays</a>
          <a href="#notes">Notes</a>
          <a href="#about">About</a>
        </nav>
      </header>

      <section className="intro" id="dashboard">
        <div>
          <p className="eyebrow">Personal investor dashboard</p>
          <h1>Compute Shiller PE from the pieces.</h1>
        </div>
        <p>
          Price, earnings, and CPI form the denominator. Recent readings use
          daily S&P 500 closes so the last 5 years move day by day.
        </p>
      </section>

      <section className="dashboardGrid" aria-label="Market dashboard">
        <div className="panel heroPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Selected Shiller PE</p>
              <h2>{snapshot.selected.cape.toFixed(1)}</h2>
            </div>
            <span className={`statusBadge ${snapshot.band.tone}`}>
              {snapshot.band.label}
            </span>
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
          />
          <div className="chartControls">
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
            <a className="detailLink" href={withBasePath("/chart")}>Open detailed chart</a>
            <a className="detailLink" href={withBasePath("/buffett")}>Open Buffett indicator</a>
            <a className="detailLink" href={withBasePath("/spx-weekdays")}>Open SPX weekdays</a>
          </div>
        </div>

        <aside className="sideStack" aria-label="Market summary">
          <MetricPanel
            label="Latest data"
            value={latestSourceDate}
            detail={latestPoint.frequency === "daily" ? "Most recent FRED S&P 500 close" : "Most recent monthly component row"}
          />
          <MetricPanel
            label="Percentile"
            value={`${snapshot.percentile}%`}
            detail="Share of observations at or below selected CAPE"
          />
          <MetricPanel
            label="10Y real EPS"
            value={formatNumber(snapshot.selected.avgRealEarnings ?? null)}
            detail="Inflation-adjusted earnings denominator"
          />
          <MetricPanel
            label="10Y Treasury"
            value={formatPercent(snapshot.selected.longRate)}
            detail={`At ${formatPointDate(snapshot.selected)}`}
          />
        </aside>
      </section>

      <section className="detailBand" aria-label="Selected valuation details">
        <div>
          <p className="eyebrow">Reading</p>
          <h2>{formatPointDate(snapshot.selected)}</h2>
          <p>{snapshot.band.description}</p>
        </div>
        <div>
          <p className="eyebrow">Real price</p>
          <strong>{formatNumber(snapshot.selected.realPrice ?? null)}</strong>
          <span>{snapshot.selected.frequency === "daily" ? "FRED daily S&P close adjusted by monthly CPI" : "Monthly S&P price adjusted by CPI"}</span>
        </div>
        <div>
          <p className="eyebrow">Formula</p>
          <strong>{formatNumber(snapshot.selected.avgRealEarnings ?? null)}</strong>
          <span>10-year average real earnings used under the selected price</span>
        </div>
      </section>

      <section className="contentColumns">
        <article className="panel" id="notes">
          <p className="eyebrow">Notes</p>
          <h2>What I watch before drawing conclusions</h2>
          <ul className="noteList">
            <li>CAPE is slow moving, so it is better as a regime signal than a timing signal.</li>
            <li>High valuations can persist when earnings quality, margins, or rates support them.</li>
            <li>The dashboard keeps the raw date series visible so the narrative does not outrun the data.</li>
          </ul>
        </article>
        <article className="panel" id="about">
          <p className="eyebrow">About this demo</p>
          <h2>Built as a personal market notebook</h2>
          <p>
            This version computes CAPE from raw components: S&P price,
            reported earnings, CPI, and a rolling 10-year real earnings average.
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
                {" "}with <a href={ohlcSourceUrl}>Nasdaq SPY OHLC</a> for candle shape.
              </>
            ) : (
              "."
            )}
          </p>
        </article>
      </section>
    </main>
  );
}

function MetricPanel({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="panel metricPanel">
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function formatPointDate(point: ShillerPoint) {
  return point.frequency === "daily" ? formatDay(point.date) : formatMonth(point.date);
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

function formatPercent(value: number | null) {
  return value === null ? "n/a" : `${value.toFixed(2)}%`;
}

function formatNumber(value: number | null) {
  return value === null
    ? "n/a"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function sourceLabel(sourceUrl: string) {
  return sourceUrl.includes("wsimg") ? "shillerdata.com workbook" : "Yale workbook";
}
