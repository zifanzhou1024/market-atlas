"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SpxWeekdayPayload } from "../../lib/spx-weekday-service";
import type {
  SpxRange,
  SpxReturnMethod,
  SpxWeekdayReturn,
  SpxWeekdayStat,
  WeekdayName
} from "../../lib/spx-weekdays";
import { isStaticExport, withBasePath } from "../../lib/paths";

type SpxWeekdayDashboardProps = {
  initialDataset: SpxWeekdayPayload | null;
  initialError?: string | null;
};

type RangeOption = {
  key: SpxRange;
  label: string;
};

type MethodOption = {
  key: SpxReturnMethod;
  label: string;
};

type Padding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type ActiveCumulativePoint = {
  weekday: WeekdayName;
  point: SpxWeekdayReturn;
};

const WEEKDAYS: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const RANGE_OPTIONS: RangeOption[] = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
  { key: "5y", label: "5Y" },
  { key: "10y", label: "10Y" },
  { key: "all", label: "Since 1993" }
];
const METHOD_OPTIONS: MethodOption[] = [
  { key: "openClose", label: "Open to close" },
  { key: "closeClose", label: "Close to close" }
];
const RANGE_LABELS: Record<SpxRange, string> = {
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  ytd: "YTD",
  "1y": "1Y",
  "2y": "2Y",
  "5y": "5Y",
  "10y": "10Y",
  all: "Since 1993"
};
const METHOD_LABELS: Record<SpxReturnMethod, string> = {
  openClose: "Open to close",
  closeClose: "Close to close"
};
const WEEKDAY_COLORS: Record<WeekdayName, string> = {
  Monday: "#2f7d74",
  Tuesday: "#4267c6",
  Wednesday: "#bb8a38",
  Thursday: "#35845e",
  Friday: "#bd4b45"
};
const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});
const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short"
});

export function SpxWeekdayDashboard({
  initialDataset,
  initialError = null
}: SpxWeekdayDashboardProps) {
  const [dataset, setDataset] = useState<SpxWeekdayPayload | null>(initialDataset);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const requestIdRef = useRef(0);
  const displayedRange = dataset?.range ?? "1y";
  const displayedMethod = dataset?.method ?? "openClose";
  const leader = useMemo(
    () => (dataset ? getLeadingWeekday(dataset.weekdayStats) : null),
    [dataset]
  );

  const loadDataset = async (nextRange: SpxRange, nextMethod: SpxReturnMethod) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(getSpxWeekdayDataUrl(nextRange, nextMethod), {
        cache: "no-store"
      });
      const payload = (await response.json()) as SpxWeekdayPayload | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to load SPX weekday performance data"
        );
      }

      if (requestIdRef.current === requestId) {
        const nextDataset = payload as SpxWeekdayPayload;
        setDataset(nextDataset);
      }
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load SPX weekday performance data"
        );
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  const applyRange = (nextRange: SpxRange) => {
    void loadDataset(nextRange, displayedMethod);
  };

  const applyMethod = (nextMethod: SpxReturnMethod) => {
    void loadDataset(displayedRange, nextMethod);
  };

  return (
    <main className="shell chartShell">
      <header className="topbar">
        <a className="brand" href={withBasePath("/")}>
          <span className="brandMark" aria-hidden="true" />
          Market Atlas
        </a>
        <nav aria-label="Primary navigation">
          <a href={withBasePath("/")}>Dashboard</a>
          <a href={withBasePath("/chart")}>CAPE chart</a>
          <a href={withBasePath("/buffett")}>Buffett indicator</a>
          <a href={withBasePath("/spx-weekdays")} aria-current="page">SPX weekdays</a>
          <a href={withBasePath("/#about")}>Data sources</a>
        </nav>
      </header>

      <section className="workbenchIntro">
        <div>
          <p className="eyebrow">Research dashboard</p>
          <h1>SPX weekday performance</h1>
          <p>
            Compare S&P 500 weekday returns across intraday and close-to-close
            methods using the local SPX market-data cache.
          </p>
        </div>
        <div className="quoteStack">
          <span>{dataset ? `${RANGE_LABELS[dataset.range]} · ${METHOD_LABELS[dataset.method]}` : "Waiting for data"}</span>
          <strong>{leader ? formatPercent(leader.totalReturn) : "n/a"}</strong>
          <em>{leader ? `${leader.weekday} cumulative return` : "No cached SPX rows"}</em>
        </div>
      </section>

      {dataset ? (
        <>
          <section className="workbenchPanel panel" aria-label="SPX weekday performance charts">
            <div className="workbenchHeader">
              <div>
                <p className="eyebrow">Weekday study</p>
                <h2>{leader ? `${leader.weekday} leads this view` : "Awaiting observations"}</h2>
              </div>
              <span className={`statusBadge ${dataset.warning || errorMessage ? "amber" : "green"}`}>
                {isLoading ? "Updating" : dataset.warning || errorMessage ? "Needs review" : "Fresh view"}
              </span>
            </div>

            <div className="chartControls workbenchControls">
              <div className="segmented weekdayRangeSegment" aria-label="SPX weekday range">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    aria-pressed={displayedRange === option.key}
                    disabled={isLoading}
                    onClick={() => applyRange(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="segmented modeSegment weekdayMethodSegment" aria-label="SPX weekday return method">
                {METHOD_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    aria-pressed={displayedMethod === option.key}
                    disabled={isLoading}
                    onClick={() => applyMethod(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {errorMessage ? (
              <p className="weekdayStatusMessage" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className="weekdayChartGrid" aria-busy={isLoading}>
              <WeekdaySummaryChart stats={dataset.summaryPoints} />
              <WeekdayCumulativeChart
                series={dataset.cumulativeSeries}
                leaderWeekday={leader?.weekday ?? "Monday"}
              />
            </div>
          </section>

          <section className="weekdayStatGrid" aria-label="Weekday statistics">
            {dataset.weekdayStats.map((stat) => (
              <WeekdayStatCard key={stat.weekday} stat={stat} />
            ))}
          </section>

          <SourceNote dataset={dataset} fetchError={errorMessage} />
        </>
      ) : (
        <section className="errorState panel" aria-labelledby="spx-weekday-error-title">
          <p className="eyebrow">SPX data unavailable</p>
          <h1 id="spx-weekday-error-title">The weekday study could not be loaded.</h1>
          <p>
            {errorMessage ??
              "The local SPX cache has no usable rows and the public source did not respond."}
          </p>
          <button
            className="retryButton"
            type="button"
            disabled={isLoading}
            onClick={() => void loadDataset("1y", "openClose")}
          >
            {isLoading ? "Retrying" : "Retry default view"}
          </button>
          <a href={getSpxWeekdayDataUrl("1y", "openClose")}>Check the data endpoint</a>
        </section>
      )}
    </main>
  );
}

function getSpxWeekdayDataUrl(range: SpxRange, method: SpxReturnMethod): string {
  return isStaticExport
    ? withBasePath(`/data/spx-weekdays/${range}-${method}.json`)
    : withBasePath(`/api/spx-weekdays?range=${range}&method=${method}`);
}

function WeekdaySummaryChart({ stats }: { stats: SpxWeekdayStat[] }) {
  const [activeWeekday, setActiveWeekday] = useState<WeekdayName | null>(null);
  const activeStat =
    stats.find((stat) => stat.weekday === activeWeekday) ?? getLeadingWeekday(stats);
  const width = 680;
  const height = 420;
  const padding = { top: 34, right: 28, bottom: 64, left: 64 };
  const values = stats.map((stat) => stat.totalReturn);
  const domain = niceDomain(Math.min(0, ...values), Math.max(0, ...values));
  const yTicks = buildValueTicks(domain.min, domain.max, 5);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const zeroY = yForValue(0, height, padding, domain.min, domain.max);
  const slotWidth = plotWidth / Math.max(stats.length, 1);
  const barWidth = Math.max(28, slotWidth * 0.52);

  return (
    <section className="weekdaySummaryChart" aria-labelledby="weekday-summary-title">
      <div className="weekdayChartHeader">
        <div>
          <p className="eyebrow">Summary</p>
          <h3 id="weekday-summary-title">Total return by weekday</h3>
        </div>
        <div className="weekdayReadout" aria-live="polite">
          <strong>{activeStat.weekday}</strong>
          <span>
            {formatPercent(activeStat.totalReturn)} total · {formatPercent(activeStat.averageReturn)} avg
          </span>
        </div>
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Bar chart of SPX cumulative return by weekday"
        onMouseLeave={() => setActiveWeekday(null)}
      >
        <rect
          x={padding.left}
          y={padding.top}
          width={plotWidth}
          height={plotHeight}
          className="plotFrame"
        />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yForValue(tick, height, padding, domain.min, domain.max)}
              y2={yForValue(tick, height, padding, domain.min, domain.max)}
              className="gridLine"
            />
            <text
              x={padding.left - 10}
              y={yForValue(tick, height, padding, domain.min, domain.max) + 4}
              className="axisLabel"
              textAnchor="end"
            >
              {formatCompactPercent(tick)}
            </text>
          </g>
        ))}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={zeroY}
          y2={zeroY}
          className="averageLine"
        />
        {stats.map((stat, index) => {
          const centerX = padding.left + slotWidth * index + slotWidth / 2;
          const valueY = yForValue(stat.totalReturn, height, padding, domain.min, domain.max);
          const barY = Math.min(valueY, zeroY);
          const barHeight = Math.max(2, Math.abs(zeroY - valueY));

          return (
            <g
              key={stat.weekday}
              role="img"
              aria-label={`${stat.weekday}: ${formatPercent(stat.totalReturn)} total return, ${formatPercent(stat.averageReturn)} average return, ${formatPercent(stat.winRate)} win rate, ${stat.sampleCount} observations`}
              onMouseEnter={() => setActiveWeekday(stat.weekday)}
              onFocus={() => setActiveWeekday(stat.weekday)}
              tabIndex={0}
            >
              <rect
                x={centerX - barWidth / 2}
                y={barY}
                width={barWidth}
                height={barHeight}
                rx="6"
                fill={WEEKDAY_COLORS[stat.weekday]}
                opacity={activeWeekday === null || activeWeekday === stat.weekday ? 0.92 : 0.46}
              />
              <text
                x={centerX}
                y={height - 26}
                className="axisLabel"
                textAnchor="middle"
              >
                {stat.weekday.slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function WeekdayCumulativeChart({
  series,
  leaderWeekday
}: {
  series: SpxWeekdayPayload["cumulativeSeries"];
  leaderWeekday: WeekdayName;
}) {
  const [activePoint, setActivePoint] = useState<ActiveCumulativePoint | null>(null);
  useEffect(() => {
    setActivePoint(null);
  }, [series]);

  const width = 760;
  const height = 380;
  const padding = { top: 30, right: 28, bottom: 58, left: 62 };
  const points = series.flatMap((item) => item.points);
  const domain = getCumulativeDomain(points);
  const active = activePoint ?? getLatestCumulativePoint(series, leaderWeekday);
  const yTicks = buildValueTicks(domain.minValue, domain.maxValue, 5);
  const dateTicks = buildDateTicks(domain.startDate, domain.endDate, 5);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const handlePointerMove = (clientX: number, rect: DOMRect) => {
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const ratio = clamp((svgX - padding.left) / plotWidth, 0, 1);
    const targetTime = domain.startTime + (domain.endTime - domain.startTime) * ratio;
    setActivePoint(findNearestCumulativePoint(series, targetTime));
  };

  return (
    <section className="weekdayCumulativeChart" aria-labelledby="weekday-cumulative-title">
      <div className="weekdayChartHeader">
        <div>
          <p className="eyebrow">Cumulative</p>
          <h3 id="weekday-cumulative-title">Weekday-return line chart</h3>
        </div>
        <div className="weekdayReadout" aria-live="polite">
          <strong>{active ? `${active.weekday} · ${formatDay(active.point.date)}` : "No returns"}</strong>
          <span>{active ? `${formatPercent(active.point.cumulativeReturn)} cumulative` : "No chart points"}</span>
        </div>
      </div>
      <div className="weekdayLegend" aria-label="Weekday legend">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>
            <i style={{ backgroundColor: WEEKDAY_COLORS[weekday] }} aria-hidden="true" />
            {weekday}
          </span>
        ))}
      </div>
      <svg
        className="chart largeChart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Line chart of SPX cumulative weekday returns"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          handlePointerMove(event.clientX, rect);
        }}
        onMouseLeave={() => setActivePoint(null)}
      >
        <rect
          x={padding.left}
          y={padding.top}
          width={plotWidth}
          height={plotHeight}
          className="plotFrame"
        />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yForValue(tick, height, padding, domain.minValue, domain.maxValue)}
              y2={yForValue(tick, height, padding, domain.minValue, domain.maxValue)}
              className="gridLine"
            />
            <text
              x={padding.left - 10}
              y={yForValue(tick, height, padding, domain.minValue, domain.maxValue) + 4}
              className="axisLabel"
              textAnchor="end"
            >
              {formatCompactPercent(tick)}
            </text>
          </g>
        ))}
        {dateTicks.map((tick) => (
          <g key={tick.date}>
            <line
              x1={xForDate(tick.date, domain.startTime, domain.endTime, width, padding)}
              x2={xForDate(tick.date, domain.startTime, domain.endTime, width, padding)}
              y1={padding.top}
              y2={height - padding.bottom}
              className="verticalGridLine"
            />
            <text
              x={xForDate(tick.date, domain.startTime, domain.endTime, width, padding)}
              y={height - 16}
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
          y1={yForValue(0, height, padding, domain.minValue, domain.maxValue)}
          y2={yForValue(0, height, padding, domain.minValue, domain.maxValue)}
          className="averageLine"
        />
        {series.map((item) => {
          const path = buildCumulativePath(
            item.points,
            width,
            height,
            padding,
            domain
          );
          const lastPoint = item.points[item.points.length - 1];

          return (
            <g key={item.weekday}>
              {path ? (
                <path
                  d={path}
                  fill="none"
                  stroke={WEEKDAY_COLORS[item.weekday]}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={activePoint === null || activePoint.weekday === item.weekday ? 0.9 : 0.34}
                />
              ) : null}
              {lastPoint ? (
                <circle
                  cx={xForDate(lastPoint.date, domain.startTime, domain.endTime, width, padding)}
                  cy={yForValue(lastPoint.cumulativeReturn, height, padding, domain.minValue, domain.maxValue)}
                  r="4.5"
                  fill={WEEKDAY_COLORS[item.weekday]}
                  stroke="#fffdfa"
                  strokeWidth="2"
                />
              ) : null}
            </g>
          );
        })}
        {active ? (
          <circle
            cx={xForDate(active.point.date, domain.startTime, domain.endTime, width, padding)}
            cy={yForValue(active.point.cumulativeReturn, height, padding, domain.minValue, domain.maxValue)}
            r="7"
            fill={WEEKDAY_COLORS[active.weekday]}
            stroke="#fffdfa"
            strokeWidth="3"
          />
        ) : null}
      </svg>
    </section>
  );
}

function WeekdayStatCard({ stat }: { stat: SpxWeekdayStat }) {
  return (
    <div className="panel chartStat weekdayStat">
      <span>
        <i style={{ backgroundColor: WEEKDAY_COLORS[stat.weekday] }} aria-hidden="true" />
        {stat.weekday}
      </span>
      <strong>{formatPercent(stat.totalReturn)}</strong>
      <small>
        {formatPercent(stat.averageReturn)} avg · {formatPercent(stat.winRate)} wins · {stat.sampleCount} days
      </small>
      <em>
        Best {formatNullablePercent(stat.bestReturn)} · Worst {formatNullablePercent(stat.worstReturn)}
      </em>
    </div>
  );
}

function SourceNote({
  dataset,
  fetchError
}: {
  dataset: SpxWeekdayPayload;
  fetchError: string | null;
}) {
  return (
    <section className="sourceNote panel">
      <p className="eyebrow">Source freshness</p>
      <p>
        Local cache covers {dataset.database.firstDate ? formatDay(dataset.database.firstDate) : "n/a"}
        {" "}through {dataset.database.latestDate ? formatDay(dataset.database.latestDate) : "n/a"}
        {" "}with {formatInteger(dataset.database.rowCount)} SPX daily rows.
      </p>
      <p className="sourceLine">
        Source fetched from <a href={dataset.source.url}>{dataset.source.displayName}</a>
        {dataset.database.latestFetchedAt ? `; latest row fetched ${formatDateTime(dataset.database.latestFetchedAt)}` : ""}
        {dataset.database.lastSuccessfulRefreshAt ? `; last refresh ${formatDateTime(dataset.database.lastSuccessfulRefreshAt)}` : ""}.
      </p>
      {dataset.warning ? (
        <p className="weekdayWarning">Warning: {dataset.warning}</p>
      ) : null}
      {fetchError ? (
        <p className="weekdayWarning">Update failed: {fetchError}</p>
      ) : null}
    </section>
  );
}

function getLeadingWeekday(stats: SpxWeekdayStat[]): SpxWeekdayStat {
  return stats.reduce((leader, stat) =>
    stat.totalReturn > leader.totalReturn ? stat : leader
  );
}

function getCumulativeDomain(points: SpxWeekdayReturn[]) {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const times = points.map((point) => dateToTime(point.date));
  const startTime = times.length > 0 ? Math.min(...times) : dateToTime(fallbackDate);
  const endTime = times.length > 0 ? Math.max(...times) : startTime;
  const startDate = new Date(startTime).toISOString().slice(0, 10);
  const endDate = new Date(endTime).toISOString().slice(0, 10);
  const values = points.map((point) => point.cumulativeReturn);
  const valueDomain = niceDomain(Math.min(0, ...values), Math.max(0, ...values));

  return {
    startDate,
    endDate,
    startTime,
    endTime,
    minValue: valueDomain.min,
    maxValue: valueDomain.max
  };
}

function getLatestCumulativePoint(
  series: SpxWeekdayPayload["cumulativeSeries"],
  leaderWeekday: WeekdayName
): ActiveCumulativePoint | null {
  const leaderSeries = series.find((item) => item.weekday === leaderWeekday);
  const leaderPoint = leaderSeries?.points[leaderSeries.points.length - 1];

  if (leaderSeries && leaderPoint) {
    return { weekday: leaderSeries.weekday, point: leaderPoint };
  }

  for (const item of series) {
    const point = item.points[item.points.length - 1];

    if (point) {
      return { weekday: item.weekday, point };
    }
  }

  return null;
}

function findNearestCumulativePoint(
  series: SpxWeekdayPayload["cumulativeSeries"],
  targetTime: number
): ActiveCumulativePoint | null {
  let active: ActiveCumulativePoint | null = null;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const item of series) {
    for (const point of item.points) {
      const distance = Math.abs(dateToTime(point.date) - targetTime);

      if (distance < smallestDistance) {
        smallestDistance = distance;
        active = { weekday: item.weekday, point };
      }
    }
  }

  return active;
}

function buildCumulativePath(
  points: SpxWeekdayReturn[],
  width: number,
  height: number,
  padding: Padding,
  domain: ReturnType<typeof getCumulativeDomain>
) {
  return points
    .map((point, index) => {
      const x = xForDate(point.date, domain.startTime, domain.endTime, width, padding);
      const y = yForValue(point.cumulativeReturn, height, padding, domain.minValue, domain.maxValue);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function niceDomain(minValue: number, maxValue: number) {
  if (minValue === maxValue) {
    const spread = Math.max(1, Math.abs(minValue) * 0.2);
    return { min: minValue - spread, max: maxValue + spread };
  }

  const spread = maxValue - minValue;
  const padding = spread * 0.12;

  return {
    min: Math.floor((minValue - padding) / 5) * 5,
    max: Math.ceil((maxValue + padding) / 5) * 5
  };
}

function buildValueTicks(min: number, max: number, count: number): number[] {
  if (count <= 1) {
    return [min];
  }

  return Array.from({ length: count }, (_, index) =>
    Math.round((min + ((max - min) * index) / (count - 1)) * 100) / 100
  );
}

function buildDateTicks(startDate: string, endDate: string, count: number) {
  const start = dateToTime(startDate);
  const end = dateToTime(endDate);

  if (end <= start || count <= 1) {
    return [{ date: startDate, label: formatTickDate(startDate, startDate, endDate) }];
  }

  return Array.from({ length: count }, (_, index) => {
    const time = start + ((end - start) * index) / (count - 1);
    const date = new Date(time).toISOString().slice(0, 10);

    return {
      date,
      label: formatTickDate(date, startDate, endDate)
    };
  }).filter(
    (tick, index, ticks) =>
      ticks.findIndex((candidate) => candidate.label === tick.label) === index
  );
}

function xForDate(
  date: string,
  startTime: number,
  endTime: number,
  width: number,
  padding: Pick<Padding, "left" | "right">
) {
  const ratio = endTime <= startTime ? 0 : (dateToTime(date) - startTime) / (endTime - startTime);
  return padding.left + clamp(ratio, 0, 1) * (width - padding.left - padding.right);
}

function yForValue(
  value: number,
  height: number,
  padding: Pick<Padding, "top" | "bottom">,
  min: number,
  max: number
) {
  const chartHeight = height - padding.top - padding.bottom;
  const ratio = (value - min) / (max - min || 1);
  return height - padding.bottom - clamp(ratio, 0, 1) * chartHeight;
}

function dateToTime(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function formatDay(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

function formatDateTime(date: string) {
  return dateTimeFormatter.format(new Date(date));
}

function formatTickDate(date: string, startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const value = new Date(`${date}T00:00:00.000Z`);
  const yearSpan = end.getUTCFullYear() - start.getUTCFullYear();

  if (yearSpan >= 2) {
    return String(value.getUTCFullYear());
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC"
  }).format(value);
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatNullablePercent(value: number | null) {
  return value === null ? "n/a" : formatPercent(value);
}

function formatCompactPercent(value: number) {
  return `${value.toFixed(Math.abs(value) < 10 ? 1 : 0)}%`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
