// scripts/prepare-test-db.cjs
/* Simple prep: seed server/data/app.test.db from data/app.db
   and point server/data/app.db at the test db (backup the dev db first).
*/
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const repoSeed = path.join(ROOT, "data", "app.db");
const serverDir = path.join(ROOT, "server", "data");
const devDb = path.join(serverDir, "app.db");
const devBak = path.join(serverDir, "app.dev.backup.db");
const testDb = path.join(serverDir, "app.test.db");

fs.mkdirSync(serverDir, { recursive: true });

if (!fs.existsSync(repoSeed)) {
  console.error(`[prepare-test-db] Seed not found: ${repoSeed}`);
  process.exit(1);
}

// 1) copy seed → test db (schema & any rows from seed)
for (const ext of ["", "-wal", "-shm"]) {
  const src = repoSeed + ext;
  const dst = testDb + ext;
  if (fs.existsSync(dst)) fs.rmSync(dst);
  if (fs.existsSync(src)) fs.copyFileSync(src, dst);
}
console.log("[prepare-test-db] Seeded test DB →", testDb);

// 2) backup current dev db if present
if (fs.existsSync(devDb)) {
  for (const ext of ["", "-wal", "-shm"]) {
    const src = devDb + ext;
    const dst = devBak + ext;
    if (fs.existsSync(dst)) fs.rmSync(dst);
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  }
  console.log("[prepare-test-db] Backed up dev DB →", devBak);
}

// 3) point dev db at the test db (symlink if possible, else copy)
try {
  // clean any existing app.db(+wal/+shm)
  for (const ext of ["", "-wal", "-shm"]) {
    const p = devDb + ext;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  // create symlink so server uses the test db file
  try {
    fs.symlinkSync(path.basename(testDb), devDb); // relative symlink
    console.log("[prepare-test-db] Linked app.db → app.test.db (symlink)");
  } catch {
    // fallback: copy (you’ll need to re-run this script if you re-seed the test)
    fs.copyFileSync(testDb, devDb);
    console.log(
      "[prepare-test-db] Copied test DB → app.db (no symlink support)"
    );
  }
} catch (e) {
  console.error(
    "[prepare-test-db] Failed to point app.db at test DB:",
    e.message
  );
  process.exit(1);
}

console.log("[prepare-test-db] Done. Now run: npm run dev");
