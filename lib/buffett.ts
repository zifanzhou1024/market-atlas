import { parseFredCsv, type FredObservation } from "./shiller";

export type BuffettPoint = {
  date: string;
  marketValue: number;
  gdp: number;
  gdpDate: string;
  ratio: number;
};

export type BuffettBand = {
  label: "Cheap" | "Fair" | "Expensive" | "Extreme";
  tone: "green" | "blue" | "amber" | "red";
  description: string;
};

export type BuffettSnapshot = {
  latest: BuffettPoint;
  selected: BuffettPoint;
  band: BuffettBand;
  percentile: number;
  average: number;
};

export type BuffettDataset = {
  points: BuffettPoint[];
  worldPoints: BuffettPoint[];
  globalPoints: BuffettPoint[];
  marketValueSourceUrl: string;
  gdpSourceUrl: string;
  worldGdpSourceUrl: string;
  worldMarketValueSourceUrl: string;
  fetchedAt: string;
};

export const FRED_MARKET_VALUE_URL =
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=NCBEILQ027S";
export const FRED_GDP_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=GDP";
export const FRED_WORLD_GDP_URL =
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=NYGDPMKTPCDWLD";
export const WORLD_BANK_MARKET_VALUE_URL =
  "https://api.worldbank.org/v2/country/WLD/indicator/CM.MKT.LCAP.CD?format=json&per_page=20000";

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

let cachedDataset: { expiresAt: number; data: BuffettDataset } | undefined;

export async function fetchBuffettData(): Promise<BuffettDataset> {
  if (cachedDataset && cachedDataset.expiresAt > Date.now()) {
    return cachedDataset.data;
  }

  const [
    marketValueResponse,
    gdpResponse,
    worldGdpResponse,
    worldMarketValueResponse
  ] = await Promise.all([
    fetch(FRED_MARKET_VALUE_URL, { cache: "no-store" }),
    fetch(FRED_GDP_URL, { cache: "no-store" }),
    fetch(FRED_WORLD_GDP_URL, { cache: "no-store" }),
    fetch(WORLD_BANK_MARKET_VALUE_URL, { cache: "no-store" })
  ]);

  if (!marketValueResponse.ok) {
    throw new Error(`FRED market value source returned ${marketValueResponse.status}`);
  }

  if (!gdpResponse.ok) {
    throw new Error(`FRED GDP source returned ${gdpResponse.status}`);
  }

  if (!worldGdpResponse.ok) {
    throw new Error(`FRED world GDP source returned ${worldGdpResponse.status}`);
  }

  if (!worldMarketValueResponse.ok) {
    throw new Error(`World Bank market value source returned ${worldMarketValueResponse.status}`);
  }

  const marketValues = parseFredCsv(await marketValueResponse.text());
  const worldGdpValues = parseFredCsv(await worldGdpResponse.text());
  const points = buildBuffettPoints(marketValues, parseFredCsv(await gdpResponse.text()));
  const worldPoints = buildBuffettPoints(
    marketValues,
    worldGdpValues,
    {
      denominatorUnit: "dollars",
      alignment: "latestAtOrBefore"
    }
  );
  const globalPoints = buildBuffettPoints(
    parseWorldBankAnnualJson(await worldMarketValueResponse.json()),
    worldGdpValues,
    {
      numeratorUnit: "dollars",
      denominatorUnit: "dollars",
      alignment: "latestAtOrBefore"
    }
  );

  if (points.length === 0) {
    throw new Error("FRED Buffett indicator sources did not contain aligned observations");
  }

  if (worldPoints.length === 0) {
    throw new Error("FRED world GDP source did not contain usable observations");
  }

  if (globalPoints.length === 0) {
    throw new Error("World Bank market value source did not contain usable observations");
  }

  const data = {
    points,
    worldPoints,
    globalPoints,
    marketValueSourceUrl: FRED_MARKET_VALUE_URL,
    gdpSourceUrl: FRED_GDP_URL,
    worldGdpSourceUrl: FRED_WORLD_GDP_URL,
    worldMarketValueSourceUrl: WORLD_BANK_MARKET_VALUE_URL,
    fetchedAt: new Date().toISOString()
  };

  cachedDataset = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data
  };

  return data;
}

export function buildBuffettPoints(
  marketValues: FredObservation[],
  gdpValues: FredObservation[],
  options: {
    numeratorUnit?: "millions" | "dollars";
    denominatorUnit?: "billions" | "dollars";
    alignment?: "exact" | "latestAtOrBefore";
  } = {}
): BuffettPoint[] {
  const numeratorUnit = options.numeratorUnit ?? "millions";
  const denominatorUnit = options.denominatorUnit ?? "billions";
  const alignment = options.alignment ?? "exact";
  const sortedGdpValues = [...gdpValues].sort((left, right) =>
    left.date.localeCompare(right.date)
  );
  const gdpByDate = new Map(sortedGdpValues.map((point) => [point.date, point]));

  return marketValues
    .map((marketValuePoint) => {
      const gdpPoint =
        alignment === "exact"
          ? gdpByDate.get(marketValuePoint.date)
          : findObservationAtOrBefore(sortedGdpValues, marketValuePoint.date);

      if (!gdpPoint || gdpPoint.value <= 0) {
        return null;
      }

      const marketValue =
        numeratorUnit === "dollars"
          ? marketValuePoint.value / 1_000_000_000
          : marketValuePoint.value / 1000;
      const gdp =
        denominatorUnit === "dollars" ? gdpPoint.value / 1_000_000_000 : gdpPoint.value;

      return {
        date: marketValuePoint.date,
        marketValue: roundNumber(marketValue),
        gdp: roundNumber(gdp),
        gdpDate: gdpPoint.date,
        ratio: roundNumber((marketValue / gdp) * 100)
      };
    })
    .filter((point): point is BuffettPoint => point !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function parseWorldBankAnnualJson(input: unknown): FredObservation[] {
  if (!Array.isArray(input) || !Array.isArray(input[1])) {
    return [];
  }

  return input[1]
    .map((row) => {
      if (!isWorldBankAnnualRow(row)) {
        return null;
      }

      return {
        date: `${row.date}-01-01`,
        value: row.value
      };
    })
    .filter((row): row is FredObservation => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function isWorldBankAnnualRow(row: unknown): row is { date: string; value: number } {
  if (!row || typeof row !== "object") {
    return false;
  }

  const candidate = row as { date?: unknown; value?: unknown };
  return (
    typeof candidate.date === "string" &&
    /^\d{4}$/.test(candidate.date) &&
    typeof candidate.value === "number" &&
    Number.isFinite(candidate.value)
  );
}

function findObservationAtOrBefore(
  observations: FredObservation[],
  date: string
): FredObservation | undefined {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (observations[index].date <= date) {
      return observations[index];
    }
  }

  return undefined;
}

export function getBuffettBand(ratio: number): BuffettBand {
  if (ratio < 80) {
    return {
      label: "Cheap",
      tone: "green",
      description: "Total market value is low versus current GDP."
    };
  }

  if (ratio < 120) {
    return {
      label: "Fair",
      tone: "blue",
      description: "Broad market value is near historical middle ranges."
    };
  }

  if (ratio < 160) {
    return {
      label: "Expensive",
      tone: "amber",
      description: "Broad market value is elevated versus GDP."
    };
  }

  return {
    label: "Extreme",
    tone: "red",
    description: "Broad market value is in a historically stretched zone."
  };
}

export function getBuffettSnapshot(points: BuffettPoint[], selectedDate: string): BuffettSnapshot {
  if (points.length === 0) {
    throw new Error("Cannot summarize an empty Buffett indicator dataset");
  }

  const latest = points[points.length - 1];
  const selected =
    [...points].reverse().find((point) => point.date <= selectedDate) ?? points[0];

  return {
    latest,
    selected,
    band: getBuffettBand(selected.ratio),
    percentile: Math.round(
      (points.filter((point) => point.ratio <= selected.ratio).length / points.length) * 100
    ),
    average: average(points.map((point) => point.ratio))
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}
