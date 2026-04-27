import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchBuffettData, type BuffettDataset } from "./buffett";
import { fetchShillerData, type ShillerDataset } from "./shiller";
import { loadSpxWeekdayData, type SpxWeekdayPayload } from "./spx-weekday-service";

const staticDataRoot = join(process.cwd(), "public", "data");

export const isGithubPagesBuild = process.env.GITHUB_PAGES === "true";

export async function loadShillerPageDataset(): Promise<ShillerDataset> {
  return isGithubPagesBuild
    ? readStaticJson<ShillerDataset>("shiller.json")
    : fetchShillerData();
}

export async function loadBuffettPageDataset(): Promise<BuffettDataset> {
  return isGithubPagesBuild
    ? readStaticJson<BuffettDataset>("buffett.json")
    : fetchBuffettData();
}

export async function loadSpxWeekdayPageDataset(): Promise<SpxWeekdayPayload> {
  return isGithubPagesBuild
    ? readStaticJson<SpxWeekdayPayload>("spx-weekdays/1y-openClose.json")
    : loadSpxWeekdayData({ range: "1y", method: "openClose" });
}

async function readStaticJson<T>(relativePath: string): Promise<T> {
  const contents = await readFile(join(staticDataRoot, relativePath), "utf8");
  return JSON.parse(contents) as T;
}
