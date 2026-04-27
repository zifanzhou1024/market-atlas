import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const apiDir = join(root, "app", "api");
const backupDir = join(root, ".next-pages-api-backup");

await rm(backupDir, { force: true, recursive: true });

if (existsSync(apiDir)) {
  await rename(apiDir, backupDir);
}

try {
  await runNextBuild();
} finally {
  if (existsSync(backupDir)) {
    await rm(apiDir, { force: true, recursive: true });
    await rename(backupDir, apiDir);
  }
}

async function runNextBuild() {
  const nextBin = join(root, "node_modules", ".bin", "next");
  const child = spawn(nextBin, ["build"], {
    env: {
      ...process.env,
      GITHUB_PAGES: "true"
    },
    stdio: "inherit"
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`GitHub Pages build failed with exit code ${exitCode}`);
  }
}
