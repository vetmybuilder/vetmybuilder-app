require("dotenv").config({ path: ".env.e2e.local" });

process.env.NEXT_PUBLIC_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100";

const { spawn } = require("child_process");
const child = spawn("npm", ["--prefix", "web", "run", "dev"], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
