import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuffettDataset } from "./buffett";
import type { ShillerDataset } from "./shiller";
import type { Manifest } from "./schemas/manifest";
import type { SpxWeekdayPayload } from "./spx-weekdays";

const staticDataRoot = join(process.cwd(), "public", "data");

export async function loadShillerPageDataset(): Promise<ShillerDataset> {
  return readStaticJson<ShillerDataset>("shiller.json");
}

export async function loadBuffettPageDataset(): Promise<BuffettDataset> {
  return readStaticJson<BuffettDataset>("buffett.json");
}

export async function loadSpxWeekdayPageDataset(): Promise<SpxWeekdayPayload> {
  return readStaticJson<SpxWeekdayPayload>("spx-weekdays/1y-openClose.json");
}

export async function loadDataManifest(): Promise<Manifest> {
  return readStaticJson<Manifest>("manifest.json");
}

export async function readStaticJson<T>(relativePath: string): Promise<T> {
  const contents = await readFile(join(staticDataRoot, relativePath), "utf8");
  return JSON.parse(contents) as T;
}
