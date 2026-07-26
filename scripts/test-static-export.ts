import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { ManifestSchema } from "../lib/schemas/manifest";

const outRoot = join(process.cwd(), "out");
const ranges = ["1m", "3m", "6m", "ytd", "1y", "2y", "5y", "10y", "all"];
const methods = ["openClose", "closeClose"];
const failures: string[] = [];

await checkFiles("required routes", [
  "index.html",
  "chart/index.html",
  "buffett/index.html",
  "spx-weekdays/index.html",
  "data/index.html"
]);
await checkFiles("required datasets", [
  "data/manifest.json",
  "data/shiller.json",
  "data/buffett.json",
  ...ranges.flatMap((range) =>
    methods.map((method) => `data/spx-weekdays/${range}-${method}.json`)
  )
]);

try {
  ManifestSchema.parse(
    JSON.parse(await readFile(join(outRoot, "data", "manifest.json"), "utf8"))
  );
  pass("manifest schema");
} catch (error) {
  fail("manifest schema", error);
}

try {
  const files = await collectFiles(outRoot);
  const webFiles = files.filter((path) => path.endsWith(".html") || path.endsWith(".js"));
  const leaks: string[] = [];
  for (const path of webFiles) {
    const contents = await readFile(path, "utf8");
    if (contents.includes('"/api/') || contents.includes("'/api/")) {
      leaks.push(path.slice(outRoot.length + 1));
    }
  }
  if (leaks.length > 0) {
    throw new Error(`found in ${leaks.join(", ")}`);
  }
  pass("no /api/ references in built HTML or JS");
} catch (error) {
  fail("no /api/ references in built HTML or JS", error);
}

try {
  const index = await readFile(join(outRoot, "index.html"), "utf8");
  if (!index.includes("/market-atlas/")) {
    throw new Error("basePath marker /market-atlas/ was not found");
  }
  pass("GitHub Pages basePath");
} catch (error) {
  fail("GitHub Pages basePath", error);
}

if (failures.length > 0) {
  console.error(`Static-export smoke test failed:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Smoke test passed");
}

async function checkFiles(label: string, relativePaths: string[]) {
  try {
    const missing: string[] = [];
    for (const relativePath of relativePaths) {
      try {
        await stat(join(outRoot, relativePath));
      } catch {
        missing.push(relativePath);
      }
    }
    if (missing.length > 0) {
      throw new Error(`missing ${missing.join(", ")}`);
    }
    pass(label);
  } catch (error) {
    fail(label, error);
  }
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    })
  );
  return files.flat();
}

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

function fail(label: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  failures.push(`FAIL  ${label}: ${message}`);
}
