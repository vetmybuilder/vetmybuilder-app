#!/usr/bin/env node
// scripts/run-page-tests-isolated.js
//
// Runs each `tests/web/pages/*.test.tsx` file in its OWN Node process
// to keep web heap usage bounded. Even with vitest `pool: "forks"` +
// `fileParallelism: false`, the same forked worker is reused across
// files, so jsdom + Next.js page imports accumulate to ~8GB+ heap by
// the 7th file and the suite OOMs (we hit this on CI). A fresh
// `vitest run` invocation per file means each Node process exits
// after one file's worth of imports - peak heap stays bounded and
// startup cost (~2s/file) is small enough to absorb.
//
// Component + util chunks don't have this problem because their per
// file working set is much smaller; they continue to run as one
// vitest invocation.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.resolve(__dirname, "../tests/web/pages");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".test.tsx") || f.endsWith(".test.ts"))
  .sort();

if (files.length === 0) {
  console.log("[run-page-tests-isolated] no page test files found, exiting.");
  process.exit(0);
}

console.log(
  `[run-page-tests-isolated] running ${files.length} page test files in isolated processes`,
);

let failed = 0;
for (const f of files) {
  const target = path.join("tests/web/pages", f);
  console.log(`\n[run-page-tests-isolated] -> ${target}`);
  const r = spawnSync(
    "npx",
    ["vitest", "run", "-c", "vitest.web.config.mts", target],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --max-old-space-size=12288`.trim(),
      },
    },
  );
  if (r.status !== 0) {
    console.error(`[run-page-tests-isolated] ${target} exit ${r.status}`);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
