// scripts/seed-test-db.cjs
const fs = require("fs");
const path = require("path");

function findRepoRoot(startDir) {
  // Walk up until we see a package.json that looks like repo root
  let dir = startDir;
  while (true) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not locate repo root (no package.json found up the tree)."
  );
}

const ROOT = findRepoRoot(__dirname);

// Candidate seed paths (prefer /data/app.db at repo root)
const candidates = [
  process.env.E2E_DB_SEED, // explicit override wins
  path.join(ROOT, "data", "app.db"), // <-- your desired path
  path.join(ROOT, "server", "data", "app.db"), // fallback (older layout)
].filter(Boolean);

let SEED = null;
for (const c of candidates) {
  if (fs.existsSync(c)) {
    SEED = c;
    break;
  }
}

if (!SEED) {
  console.error(
    "[seed] Seed DB not found. Tried:\n  " + candidates.join("\n  ")
  );
  process.exit(1);
}

// Target test DB is always under server/data/app.test.db (API uses relative path ./data/app.test.db)
const TARGET =
  process.env.E2E_DB_TARGET || path.join(ROOT, "server", "data", "app.test.db");

const walSeed = SEED + "-wal";
const shmSeed = SEED + "-shm";
const walTarget = TARGET + "-wal";
const shmTarget = TARGET + "-shm";

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
for (const p of [TARGET, walTarget, shmTarget]) {
  if (fs.existsSync(p)) fs.rmSync(p);
}

fs.copyFileSync(SEED, TARGET);
if (fs.existsSync(walSeed)) fs.copyFileSync(walSeed, walTarget);
if (fs.existsSync(shmSeed)) fs.copyFileSync(shmSeed, shmTarget);

console.log("[seed] Copied dev DB → test DB");
console.log("  repoRoot:", ROOT);
console.log("  seed    :", SEED);
console.log("  target  :", TARGET);
if (fs.existsSync(walSeed)) console.log("  + copied WAL");
if (fs.existsSync(shmSeed)) console.log("  + copied SHM");
