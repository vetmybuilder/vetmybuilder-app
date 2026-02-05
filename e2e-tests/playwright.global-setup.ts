import { execSync } from "child_process";
import path from "path";

export default async () => {
  // run from repo root so "scripts/dev-manual-clean.js" resolves correctly
  const repoRoot = path.resolve(__dirname, "..");

  execSync("node scripts/dev-manual-clean.js", {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
};
