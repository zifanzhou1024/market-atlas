import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ranges = ["1m", "3m", "6m", "ytd", "1y", "2y", "5y", "10y", "all"];
const methods = ["openClose", "closeClose"];
const dataRoot = join(process.cwd(), "public", "data");

const [{ fetchShillerData }, { fetchBuffettData }, { loadSpxWeekdayData }] =
  await Promise.all([
    import("../lib/shiller.ts"),
    import("../lib/buffett.ts"),
    import("../lib/spx-weekday-service.ts")
  ]);

await mkdir(join(dataRoot, "spx-weekdays"), { recursive: true });

await Promise.all([
  writeJson("shiller.json", await fetchShillerData()),
  writeJson("buffett.json", await fetchBuffettData())
]);

for (const range of ranges) {
  for (const method of methods) {
    await writeJson(
      `spx-weekdays/${range}-${method}.json`,
      await loadSpxWeekdayData({ range, method })
    );
  }
}

async function writeJson(relativePath, data) {
  await writeFile(
    join(dataRoot, relativePath),
    `${JSON.stringify(data)}\n`,
    "utf8"
  );
}
