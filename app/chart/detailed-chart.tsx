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
import { getDashboardSnapshot } from "../../lib/market-metrics";
import type { ShillerPoint } from "../../lib/shiller";
import {
  getCapeBounds,
  ValuationChart,
  type ChartMode
} from "../valuation-chart";

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
  const [selectedDate, setSelectedDate] = useState(latestPoint.date);
  const [activePreset, setActivePreset] = useState<ActivePreset>("1y");
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
        <a className="brand" href="/">
          <span className="brandMark" aria-hidden="true" />
          Market Atlas
        </a>
        <nav aria-label="Primary navigation">
          <a href="/">Dashboard</a>
          <a href="/chart">Detailed chart</a>
          <a href="/buffett">Buffett indicator</a>
          <a href="/spx-weekdays">SPX weekdays</a>
          <a href="/#about">Data sources</a>
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

      <section className="sourceNote panel">
        <p className="eyebrow">Method</p>
        <p>
          The close line remains the computed CAPE value from Shiller components and FRED S&P 500 closes.
          Candle bodies use Nasdaq SPY daily OHLC as a same-day range proxy, scaled to the FRED S&P 500 close,
          then divided by the same 10-year real earnings denominator.
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

function sourceLabel(sourceUrl: string) {
  return sourceUrl.includes("wsimg") ? "shillerdata.com workbook" : "Yale workbook";
}
