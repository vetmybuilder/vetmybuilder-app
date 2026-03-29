require("dotenv").config({ path: ".env.e2e.local" });

// Use relative /api so the browser resolves API calls against whatever port it
// loaded the page from. Worker 0 hits Next.js (port 3000) directly; workers
// 1+ hit per-shard proxies (ports 3001-3003). Each proxy routes /api/* to the
// correct API shard. An absolute URL (e.g. http://localhost:3100) would bake
// shard-0's port into the JS bundle and break all other workers.
process.env.NEXT_PUBLIC_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "/api";

const { spawn } = require("child_process");
const child = spawn("npm", ["--prefix", "web", "run", "dev"], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
