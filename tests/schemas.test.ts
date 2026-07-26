import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { BuffettDatasetSchema } from "../lib/schemas/buffett";
import { ShillerDatasetSchema } from "../lib/schemas/shiller";
import { SpxWeekdayPayloadSchema } from "../lib/schemas/spx-weekdays";

describe("committed static-data schemas", () => {
  test("accepts the committed Shiller dataset", async () => {
    const data = JSON.parse(await readFile("public/data/shiller.json", "utf8"));
    expect(ShillerDatasetSchema.safeParse(data).success).toBe(true);
  });

  test("accepts the committed Buffett dataset", async () => {
    const data = JSON.parse(await readFile("public/data/buffett.json", "utf8"));
    expect(BuffettDatasetSchema.safeParse(data).success).toBe(true);
  });

  test("accepts every committed SPX weekday variant", async () => {
    const ranges = ["1m", "3m", "6m", "ytd", "1y", "2y", "5y", "10y", "all"];
    const methods = ["openClose", "closeClose"];
    for (const range of ranges) {
      for (const method of methods) {
        const data = JSON.parse(
          await readFile(`public/data/spx-weekdays/${range}-${method}.json`, "utf8")
        );
        expect(
          SpxWeekdayPayloadSchema.safeParse(data).success,
          `${range}-${method}.json`
        ).toBe(true);
      }
    }
  });

  test("rejects out-of-bounds CAPE values", async () => {
    const data = JSON.parse(await readFile("public/data/shiller.json", "utf8"));
    data.points[0].cape = Number.POSITIVE_INFINITY;
    expect(ShillerDatasetSchema.safeParse(data).success).toBe(false);
  });
});
