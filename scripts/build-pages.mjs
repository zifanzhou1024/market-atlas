import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
await runNextBuild();

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
