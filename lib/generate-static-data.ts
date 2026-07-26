import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ZodError } from "zod";
import {
  FRED_GDP_URL,
  FRED_MARKET_VALUE_URL,
  FRED_WORLD_GDP_URL,
  WORLD_BANK_MARKET_VALUE_URL,
  fetchBuffettData
} from "./buffett";
import {
  FRED_SP500_URL,
  NASDAQ_SPY_SOURCE_URL,
  SHILLER_SOURCE_URLS,
  fetchShillerData
} from "./shiller";
import {
  YAHOO_SPX_CHART_BASE_URL,
  fetchYahooSpxChartJson,
  parseYahooSpxChartJson,
  type SpxDailyPrice
} from "./spx-source";
import {
  buildSpxWeekdayDataset,
  type SpxRange,
  type SpxReturnMethod,
  type SpxWeekdayPayload
} from "./spx-weekdays";
import { BuffettDatasetSchema } from "./schemas/buffett";
import {
  ManifestSchema,
  type Manifest,
  type SourceStatus
} from "./schemas/manifest";
import { ShillerDatasetSchema } from "./schemas/shiller";
import { SpxWeekdayPayloadSchema } from "./schemas/spx-weekdays";

const ranges: SpxRange[] = ["1m", "3m", "6m", "ytd", "1y", "2y", "5y", "10y", "all"];
const methods: SpxReturnMethod[] = ["openClose", "closeClose"];

export type StaticDataFetchers = {
  shiller: () => Promise<unknown>;
  buffett: () => Promise<unknown>;
  spx: () => Promise<SpxDailyPrice[]>;
};

export type GenerateStaticDataOptions = {
  dataRoot?: string;
  fetchers?: Partial<StaticDataFetchers>;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

const defaultFetchers: StaticDataFetchers = {
  shiller: fetchShillerData,
  buffett: fetchBuffettData,
  spx: async () => parseYahooSpxChartJson(await fetchYahooSpxChartJson())
};

export async function generateStaticData(
  options: GenerateStaticDataOptions = {}
): Promise<Manifest> {
  const dataRoot = options.dataRoot ?? join(process.cwd(), "public", "data");
  const fetchers = { ...defaultFetchers, ...options.fetchers };
  const env = options.env ?? process.env;
  const now = options.now?.() ?? new Date();
  const generatedAt = now.toISOString();
  const priorManifest = await readPriorManifest(dataRoot);

  await mkdir(join(dataRoot, "spx-weekdays"), { recursive: true });

  const shiller = await generateSingleSource({
    key: "shiller",
    relativePath: "shiller.json",
    displayName: "Shiller CAPE workbook",
    sourceUrls: [...SHILLER_SOURCE_URLS, FRED_SP500_URL, NASDAQ_SPY_SOURCE_URL],
    fetcher: fetchers.shiller,
    parser: (value) => ShillerDatasetSchema.parse(value),
    getLatestDate: (value) => value.points.at(-1)?.date ?? null,
    getRowCount: (value) => value.points.length,
    dataRoot,
    generatedAt,
    priorManifest
  });

  const buffett = await generateSingleSource({
    key: "buffett",
    relativePath: "buffett.json",
    displayName: "FRED Buffett indicator + World Bank",
    sourceUrls: [
      FRED_MARKET_VALUE_URL,
      FRED_GDP_URL,
      FRED_WORLD_GDP_URL,
      WORLD_BANK_MARKET_VALUE_URL
    ],
    fetcher: fetchers.buffett,
    parser: (value) => BuffettDatasetSchema.parse(value),
    getLatestDate: (value) => value.points.at(-1)?.date ?? null,
    getRowCount: (value) => value.points.length,
    dataRoot,
    generatedAt,
    priorManifest
  });

  const spxWeekdays = await generateSpxWeekdays({
    fetcher: fetchers.spx,
    dataRoot,
    generatedAt,
    priorManifest
  });

  const manifest = ManifestSchema.parse({
    schemaVersion: 1,
    generatedAt,
    generatedBy: {
      ref: env.GITHUB_REF ?? "local",
      sha: env.GITHUB_SHA ?? null,
      runId: env.GITHUB_RUN_ID ?? null,
      runUrl:
        env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
          ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
          : null
    },
    validationTier: "L3",
    sources: { shiller, buffett, spxWeekdays }
  });

  await writeJson(join(dataRoot, "manifest.json"), manifest);

  if (Object.values(manifest.sources).every((source) => source.status === "failed")) {
    throw new Error("All static data sources failed and no committed fallback exists");
  }

  return manifest;
}

async function generateSingleSource<T>({
  key,
  relativePath,
  displayName,
  sourceUrls,
  fetcher,
  parser,
  getLatestDate,
  getRowCount,
  dataRoot,
  generatedAt,
  priorManifest
}: {
  key: "shiller" | "buffett";
  relativePath: string;
  displayName: string;
  sourceUrls: string[];
  fetcher: () => Promise<unknown>;
  parser: (value: unknown) => T;
  getLatestDate: (value: T) => string | null;
  getRowCount: (value: T) => number;
  dataRoot: string;
  generatedAt: string;
  priorManifest: Manifest | null;
}): Promise<SourceStatus> {
  const path = join(dataRoot, relativePath);

  try {
    const value = parser(await fetcher());
    await writeJson(path, value);
    return {
      displayName,
      status: "ok",
      latestDate: getLatestDate(value),
      rowCount: getRowCount(value),
      sourceUrls,
      lastSuccessfulFetchAt: generatedAt,
      lastAttemptedFetchAt: generatedAt,
      errorMessage: null
    };
  } catch (error) {
    const fallback = await readValidated(path, parser);
    const prior = priorManifest?.sources[key];
    return {
      displayName,
      status: fallback ? "stale" : "failed",
      latestDate: fallback ? getLatestDate(fallback) : prior?.latestDate ?? null,
      rowCount: fallback ? getRowCount(fallback) : prior?.rowCount ?? 0,
      sourceUrls,
      lastSuccessfulFetchAt: prior?.lastSuccessfulFetchAt ?? null,
      lastAttemptedFetchAt: generatedAt,
      errorMessage: summarizeError(error)
    };
  }
}

async function generateSpxWeekdays({
  fetcher,
  dataRoot,
  generatedAt,
  priorManifest
}: {
  fetcher: () => Promise<SpxDailyPrice[]>;
  dataRoot: string;
  generatedAt: string;
  priorManifest: Manifest | null;
}): Promise<SourceStatus> {
  const displayName = "Yahoo Finance SPX chart";
  const sourceUrls = [YAHOO_SPX_CHART_BASE_URL];

  try {
    const rows = await fetcher();
    if (rows.length < 5000) {
      throw new Error(`SPX source returned ${rows.length} rows; at least 5000 are required`);
    }

    const payloads = ranges.flatMap((range) =>
      methods.map((method) => {
        const payload: SpxWeekdayPayload = {
          ...buildSpxWeekdayDataset(rows, { range, method }),
          source: {
            key: "yahoo-spx-chart",
            name: displayName,
            displayName,
            provider: "Yahoo Finance",
            url: YAHOO_SPX_CHART_BASE_URL
          }
        };
        return {
          relativePath: `spx-weekdays/${range}-${method}.json`,
          payload: SpxWeekdayPayloadSchema.parse(payload)
        };
      })
    );

    await Promise.all(
      payloads.map(({ relativePath, payload }) =>
        writeJson(join(dataRoot, relativePath), payload)
      )
    );

    return {
      displayName,
      status: "ok",
      latestDate: rows.at(-1)?.date ?? null,
      rowCount: rows.length,
      sourceUrls,
      lastSuccessfulFetchAt: generatedAt,
      lastAttemptedFetchAt: generatedAt,
      errorMessage: null
    };
  } catch (error) {
    const fallbacks = await Promise.all(
      ranges.flatMap((range) =>
        methods.map((method) =>
          readValidated(
            join(dataRoot, "spx-weekdays", `${range}-${method}.json`),
            (value) => SpxWeekdayPayloadSchema.parse(value)
          )
        )
      )
    );
    const hasCompleteFallback = fallbacks.every(Boolean);
    const prior = priorManifest?.sources.spxWeekdays;

    return {
      displayName,
      status: hasCompleteFallback ? "stale" : "failed",
      latestDate: prior?.latestDate ?? fallbacks.find(Boolean)?.endDate ?? null,
      rowCount: prior?.rowCount ?? 0,
      sourceUrls,
      lastSuccessfulFetchAt: prior?.lastSuccessfulFetchAt ?? null,
      lastAttemptedFetchAt: generatedAt,
      errorMessage: summarizeError(error)
    };
  }
}

async function readPriorManifest(dataRoot: string): Promise<Manifest | null> {
  return readValidated(join(dataRoot, "manifest.json"), (value) =>
    ManifestSchema.parse(value)
  );
}

async function readValidated<T>(
  path: string,
  parser: (value: unknown) => T
): Promise<T | null> {
  try {
    return parser(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

function summarizeError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "dataset"}: ${issue.message}`)
      .join("; ");
  }

  return error instanceof Error ? error.message : "Unknown data generation error";
}
