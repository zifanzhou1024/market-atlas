import { generateStaticData } from "../lib/generate-static-data.ts";

const manifest = await generateStaticData();
const summary = Object.entries(manifest.sources)
  .map(([key, source]) => `${key}=${source.status}`)
  .join(", ");

console.log(`Static data generated: ${summary}`);
