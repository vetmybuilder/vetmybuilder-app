#!/usr/bin/env node
// scripts/run-tests-isolated.js
//
// Runs every `*.test.ts(x)` file in the given directory in its OWN
// Node process so each `vitest run` invocation exits clean before the
// next file starts. Bounds peak heap so a long suite doesn't OOM the
// shared vitest fork-pool worker (jsdom + Next.js imports accumulate
// otherwise; we've hit ~8GB by the time component + page suites
// finish on CI).
//
// Usage:
//   node scripts/run-tests-isolated.js <relative-dir> [--exclude file1,file2]
//
// Example:
//   node scripts/run-tests-isolated.js tests/web/components
//   node scripts/run-tests-isolated.js tests/web/pages --exclude tradesmanJobsDeck.test.tsx,tradesmanJobsList.test.tsx
//
// `--exclude` files are intentionally NOT run here - they're suites
// heavy enough to OOM even in a fresh subprocess and belong in
// Playwright. Tracked under the pending E2E-port task.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: run-tests-isolated.js <relative-dir> [--exclude a,b]");
  process.exit(2);
}

const relDir = args[0];
const excludeArgIndex = args.indexOf("--exclude");
const excludeList =
  excludeArgIndex >= 0 && args[excludeArgIndex + 1]
    ? args[excludeArgIndex + 1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];
const EXCLUDE = new Set(excludeList);

const dir = path.resolve(__dirname, "..", relDir);
const tag = `[run-tests-isolated:${relDir}]`;

if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error(`${tag} not a directory: ${dir}`);
  process.exit(2);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".test.tsx") || f.endsWith(".test.ts"))
  .filter((f) => !EXCLUDE.has(f))
  .sort();

if (EXCLUDE.size > 0) {
  console.log(
    `${tag} skipping (port to Playwright): ${[...EXCLUDE].join(", ")}`,
  );
}

if (files.length === 0) {
  console.log(`${tag} no test files found, exiting.`);
  process.exit(0);
}

console.log(
  `${tag} running ${files.length} test files in isolated processes`,
);

let failed = 0;
for (const f of files) {
  const target = path.join(relDir, f);
  console.log(`\n${tag} -> ${target}`);
  const r = spawnSync(
    "npx",
    ["vitest", "run", "-c", "vitest.web.config.mts", target],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS || ""} --max-old-space-size=12288`.trim(),
      },
    },
  );
  if (r.status !== 0) {
    console.error(`${tag} ${target} exit ${r.status}`);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
