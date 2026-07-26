import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { generateStaticData } from "../lib/generate-static-data";
import { ManifestSchema } from "../lib/schemas/manifest";
import type { SpxDailyPrice } from "../lib/spx-source";

const temporaryDirectories: string[] = [];
const now = new Date("2026-07-26T12:00:00.000Z");

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("generateStaticData", () => {
  test("writes validated datasets and an all-ok manifest", async () => {
    const dataRoot = await createDataRoot();
    const manifest = await generateStaticData({
      dataRoot,
      now: () => now,
      fetchers: {
        shiller: async () => makeShillerDataset(),
        buffett: async () => makeBuffettDataset(),
        spx: async () => makeSpxRows()
      },
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: "abc123",
        GITHUB_RUN_ID: "42",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "zifanzhou1024/market-atlas"
      }
    });

    expect(Object.values(manifest.sources).map((source) => source.status)).toEqual([
      "ok",
      "ok",
      "ok"
    ]);
    expect(manifest.generatedBy.runUrl).toBe(
      "https://github.com/zifanzhou1024/market-atlas/actions/runs/42"
    );
    expect(
      ManifestSchema.safeParse(
        JSON.parse(await readFile(join(dataRoot, "manifest.json"), "utf8"))
      ).success
    ).toBe(true);
  });

  test("preserves a valid committed fallback and marks the source stale", async () => {
    const dataRoot = await createDataRoot();
    const fetchers = {
      shiller: async () => makeShillerDataset(),
      buffett: async () => makeBuffettDataset(),
      spx: async () => makeSpxRows()
    };

    await generateStaticData({ dataRoot, now: () => now, fetchers });
    const before = await readFile(join(dataRoot, "shiller.json"), "utf8");
    const later = new Date("2026-07-27T12:00:00.000Z");
    const manifest = await generateStaticData({
      dataRoot,
      now: () => later,
      fetchers: {
        ...fetchers,
        shiller: async () => {
          throw new Error("Shiller source returned 503");
        }
      }
    });

    expect(manifest.sources.shiller.status).toBe("stale");
    expect(manifest.sources.shiller.errorMessage).toContain("503");
    expect(manifest.sources.shiller.lastSuccessfulFetchAt).toBe(now.toISOString());
    expect(await readFile(join(dataRoot, "shiller.json"), "utf8")).toBe(before);
  });
});

async function createDataRoot() {
  const path = await mkdtemp(join(tmpdir(), "market-atlas-static-"));
  temporaryDirectories.push(path);
  return path;
}

function makeShillerDataset() {
  const points = Array.from({ length: 1500 }, (_, index) => ({
    date: day(index, "1900-01-01"),
    cape: 20,
    price: 100 + index,
    earnings: 10,
    longRate: 4,
    frequency: "daily" as const
  }));
  return {
    points,
    sourceUrl: "https://example.com/shiller.xls",
    dailySourceUrl: "https://example.com/spx.csv",
    ohlcSourceUrl: "https://example.com/spy.json",
    fetchedAt: now.toISOString()
  };
}

function makeBuffettDataset() {
  const points = Array.from({ length: 200 }, (_, index) => ({
    date: day(index * 90, "1950-01-01"),
    marketValue: 1000 + index,
    gdp: 900 + index,
    gdpDate: day(index * 90, "1950-01-01"),
    ratio: 100
  }));
  return {
    points,
    worldPoints: points,
    globalPoints: points,
    marketValueSourceUrl: "https://example.com/market.csv",
    gdpSourceUrl: "https://example.com/gdp.csv",
    worldGdpSourceUrl: "https://example.com/world-gdp.csv",
    worldMarketValueSourceUrl: "https://example.com/world-market.json",
    fetchedAt: now.toISOString()
  };
}

function makeSpxRows(): SpxDailyPrice[] {
  return Array.from({ length: 5000 }, (_, index) => {
    const close = 1000 + index / 10;
    return {
      date: day(index, "2000-01-01"),
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1_000_000
    };
  });
}

function day(offset: number, start: string) {
  const value = new Date(`${start}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
